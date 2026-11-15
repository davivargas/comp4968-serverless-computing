import csv
import datetime
import json
import math
import re

import pytest

from helpers.fakes import FakeCognito, FakeDB, norm
from helpers.lambdas import DB_DIR, load_lambda
from payroll_common.http_utils import HttpError

"""Tests for the db-init Lambda, the one-off setup function invoked with
{"action": "schema" | "seed" | "demo" | "reset"}.

Approach: a fake pg8000 connection answers SQL by text fragment and
records every statement, commit and rollback; Cognito is faked too. The
module reads its SQL/CSV/JSON from backend/db, like the deployed zip. A
last group checks the demo data files agree with each other, because
reset only deletes what the manifest lists.
"""

dbi = load_lambda("db-init")

MANIFEST = json.loads((DB_DIR / "demo_manifest.json").read_text("utf-8"))
with open(DB_DIR / "demo_timesheets.csv", encoding="utf-8", newline="") as f:
    CSV_ROWS = list(csv.DictReader(f))
DEMO_SQL = (DB_DIR / "demo_data.sql").read_text("utf-8")
NEED_SCHEMA = {"ok": False, "message": "Load the schema first (action: schema)."}
ADMIN = {"email": "Ivy@Example.com", "firstName": "Ivy", "lastName": "Tran"}
PEOPLE = [(2, "ana@test.com", "Ana", "Lee"), (3, "bo@test.com", "Bo", "Kim")]
EMAILS = ["ana@test.com", "bo@test.com"]
PERIOD = {"pay_period_id": 11, "start_date": datetime.date(2026, 9, 13)}
PREVIEW = {"demo_people": 2, "timesheet_entries": 40, "demo_pay_stubs": 6,
           "other_pay_stubs": 0, "released_pay_periods": 3}
RESET_ORDER = [
    "paystub_earning", "paystub", "pay_period", "timesheet_entry",
    "project_assignment", "direct_deposit", "project", "employee", "team",
    "employee", "position_wage", "position",
]


def tables_exist(conn, *names):
    """Answers to_regclass() lookups: only the named tables exist."""
    present = {f"public.{name}" for name in names}
    conn.on("to_regclass", lambda params: [{"ok": params[0] in present}])


def seed_cursor(conn):
    """Answers the INSERT ... RETURNING ids that seed_admin reads back."""
    conn.on("INSERT INTO position", [(5,)])
    conn.on("INSERT INTO employee", [(1,)])


def ready_for_demo(conn):
    """Answers every lookup load_demo makes on a seeded database."""
    conn.on("information_schema.columns", {"x": 1})
    conn.on("special_type IS NOT NULL", {"n": 3})
    conn.on("FROM employee LIMIT 1", {"x": 1})
    conn.on("coalesce(max(employee_id)", {"n": 1})
    conn.on("coalesce(max(team_id)", {"n": 0})
    conn.on("INSERT INTO timesheet_entry", [], rowcount=len(CSV_ROWS))
    conn.on("FROM employee WHERE employee_id >", PEOPLE)
    conn.on("WHERE role_id = 2", {"employee_id": 3, "name": "Bo Kim"})
    conn.on("FROM pay_period pp", [PERIOD])
    conn.on("AS teams", {"teams": 5, "projects": 7, "timesheet_entries": 9,
                         "pay_stubs": 4, "direct_deposits": 2})


def ready_for_reset(conn):
    """Answers the lookups reset_demo makes when demo data is present."""
    conn.on("WHERE email = ANY", [{"employee_id": 2}, {"employee_id": 3}])
    conn.on("AS demo_people", PREVIEW)


@pytest.fixture(autouse=True)
def conn(monkeypatch):
    """Fake connection behind get_conn/one/query: schema loaded
    (employee and stat_holiday exist), no rows. Files load from db/."""
    fake = FakeDB()
    tables_exist(fake, "employee", "stat_holiday")
    monkeypatch.setattr(dbi, "get_conn", lambda: fake)
    monkeypatch.setattr(dbi, "one", fake.one)
    monkeypatch.setattr(dbi, "query", fake.query)
    monkeypatch.setattr(dbi, "__file__", str(DB_DIR / "lambda_function.py"))
    return fake


@pytest.fixture(autouse=True)
def cognito(monkeypatch):
    """Fake Cognito client, so no test can reach a real user pool."""
    fake = FakeCognito()
    monkeypatch.setattr(dbi, "_cognito", fake)
    monkeypatch.setenv("USER_POOL_ID", "pool-test")
    return fake


@pytest.fixture(autouse=True)
def releases(monkeypatch):
    """Records release_period calls; ensure_periods becomes a no-op."""
    calls = []

    def release(conn, period_id, ctx, write_audit=True):
        calls.append({"period_id": period_id, "ctx": ctx, "audit": write_audit})

    monkeypatch.setattr(dbi, "release_period", release)
    monkeypatch.setattr(dbi.pr, "ensure_periods", lambda conn, d: None)
    return calls


# ---- dispatch --------------------------------------------------------

@pytest.mark.parametrize("event", [None, {}, {"action": "drop"}])
def test_unknown_action_is_rejected(conn, event):
    """Only the four known actions run; anything else is a 400 before
    the database is touched."""
    with pytest.raises(HttpError) as err:
        dbi.lambda_handler(event)
    assert err.value.status == 400 and conn.calls == []


@pytest.mark.parametrize("action, step", [
    ("schema", "load_schema"), ("seed", "seed_admin"),
    ("demo", "load_demo"), ("reset", "reset_demo"),
])
def test_actions_dispatch_to_their_step(monkeypatch, action, step):
    """Each action runs its own setup step and returns that step's
    result as the invoke response."""
    monkeypatch.setattr(dbi, step, lambda *args: {"ran": step})
    assert dbi.lambda_handler({"action": action}) == {"ran": step}


@pytest.mark.parametrize("event", [
    {"action": "seed", **ADMIN}, {"action": "demo"}, {"action": "reset"},
])
def test_steps_need_the_schema_first(conn, cognito, event):
    """Seed, demo and reset explain that the schema must be loaded first
    instead of failing on a missing table."""
    tables_exist(conn)
    assert dbi.lambda_handler(event) == NEED_SCHEMA
    assert conn.executed == [] and cognito.calls == []


# ---- schema ----------------------------------------------------------

def test_schema_runs_schema_sql_and_commits(conn):
    """On an empty database all of schema.sql runs as one script and is
    committed; the response reports the table count."""
    tables_exist(conn)
    conn.on("information_schema.tables", {"n": 14})
    result = dbi.lambda_handler({"action": "schema"})
    [(script, _)] = conn.executed
    assert script == norm((DB_DIR / "schema.sql").read_text("utf-8"))
    assert conn.commits == 1
    assert result == {"ok": True, "message": "Schema loaded.", "tables": 14}


def test_schema_is_not_loaded_twice(conn):
    """If the employee table exists nothing runs, so a second invoke
    can't wipe or duplicate anything."""
    result = dbi.lambda_handler({"action": "schema"})
    assert result["ok"] is False
    assert conn.executed == [] and conn.commits == 0


def test_schema_failure_rolls_back(conn):
    """A failing schema script is rolled back and the error re-raised,
    so the invoke shows as failed."""
    tables_exist(conn)
    conn.fail_on("CREATE TABLE", RuntimeError("syntax error"))
    with pytest.raises(RuntimeError):
        dbi.lambda_handler({"action": "schema"})
    assert conn.rollbacks == 1 and conn.commits == 0


# ---- seed (first IT admin) -------------------------------------------

def test_seed_creates_first_it_admin(conn, cognito):
    """Creates the Cognito user with an emailed invite, then position,
    employee (role_id 3 = IT), wage and special projects in one commit."""
    seed_cursor(conn)
    result = dbi.lambda_handler({"action": "seed", **ADMIN})
    [kwargs] = cognito.kwargs("admin_create_user")
    assert kwargs["Username"] == "ivy@example.com"
    assert kwargs["DesiredDeliveryMediums"] == ["EMAIL"]
    [(sql, params)] = conn.ran("INSERT INTO employee")
    assert "VALUES (%s, %s, %s, %s, 3, %s, %s)" in sql
    assert params[:3] == ("sub-ivy@example.com", "Ivy", "Tran")
    assert params[3:5] == ("ivy@example.com", 5)
    assert len(conn.ran("INSERT INTO project")) == 3
    assert conn.commits == 1
    assert result["ok"] and result["employeeId"] == 1


@pytest.mark.parametrize("change", [
    {"email": "not-an-email"}, {"firstName": ""}, {"lastName": None},
])
def test_seed_validates_input_first(conn, cognito, change):
    """Bad admin details are a 400 before any database or Cognito call."""
    with pytest.raises(HttpError) as err:
        dbi.lambda_handler({"action": "seed", **ADMIN, **change})
    assert err.value.status == 400
    assert conn.calls == [] and cognito.calls == []


def test_seed_only_runs_on_an_empty_database(conn, cognito):
    """Once any employee exists seed refuses, so it can't be used later
    to add another admin."""
    conn.on("FROM employee LIMIT 1", {"x": 1})
    result = dbi.lambda_handler({"action": "seed", **ADMIN})
    assert result["ok"] is False
    assert conn.executed == [] and cognito.calls == []


def test_seed_email_already_in_cognito(conn, cognito):
    """An email already in the user pool stops the seed before any
    database write."""
    exists = FakeCognito.exceptions.UsernameExistsException()
    cognito.errors["admin_create_user"] = exists
    result = dbi.lambda_handler({"action": "seed", **ADMIN})
    assert result["ok"] is False and "user pool" in result["message"]
    assert conn.executed == []


def test_seed_db_failure_deletes_cognito_user(conn, cognito):
    """If an insert fails it's rolled back and the new Cognito user is
    deleted, so a retry starts clean."""
    seed_cursor(conn)
    conn.fail_on("INSERT INTO position_wage", RuntimeError("db down"))
    with pytest.raises(RuntimeError):
        dbi.lambda_handler({"action": "seed", **ADMIN})
    assert conn.rollbacks == 1 and conn.commits == 0
    assert cognito.users("admin_delete_user") == ["ivy@example.com"]


def test_special_projects_are_idempotent(conn):
    """Sick, vacation and misc are each inserted only if that kind is
    missing, so re-running can't duplicate them."""
    dbi.ensure_special_projects(conn.cursor(), created_by=1)
    inserts = conn.ran("INSERT INTO project")
    assert [params[2] for _, params in inserts] == ["SICK", "VAC", "MISC"]
    assert all("WHERE NOT EXISTS" in sql for sql, _ in inserts)


def test_special_project_codes_must_be_free(conn):
    """If a normal project already uses 9001-9003, setup stops instead
    of creating clashing codes."""
    conn.on("SELECT project_code FROM project", [(9001,)])
    with pytest.raises(ValueError, match="9001"):
        dbi.ensure_special_projects(conn.cursor(), created_by=1)
    assert conn.ran("INSERT INTO project") == []


# ---- demo data -------------------------------------------------------

def test_demo_loads_everything_in_one_commit(conn, cognito, releases):
    """Runs demo_data.sql, loads every CSV row, gives each new person a
    login and releases past periods, then commits once."""
    ready_for_demo(conn)
    result = dbi.lambda_handler({"action": "demo"})
    assert conn.executed[0][0] == norm(DEMO_SQL)
    chunks = math.ceil(len(CSV_ROWS) / 400)
    assert len(conn.ran("INSERT INTO demo_ts")) == chunks
    assert cognito.users("admin_create_user") == EMAILS
    subs = [params for _, params in conn.ran("UPDATE employee SET cognito_sub")]
    assert subs == [("sub-ana@test.com", 2), ("sub-bo@test.com", 3)]
    [release] = releases
    assert release["period_id"] == 11 and release["audit"] is False
    assert release["ctx"]["employee_id"] == 3
    assert conn.commits == 1 and result["ok"]
    assert result["csvTimesheetRows"] == len(CSV_ROWS)
    assert result["employees"] == 2 and result["releasedPayPeriods"] == 1


def test_demo_logins_work_without_an_invite(conn, cognito):
    """Demo users get no invite email and a permanent shared password,
    so anyone can sign in as them right away."""
    ready_for_demo(conn)
    dbi.lambda_handler({"action": "demo"})
    created = cognito.kwargs("admin_create_user")
    assert all(kw["MessageAction"] == "SUPPRESS" for kw in created)
    passwords = cognito.kwargs("admin_set_user_password")
    assert [kw["Username"] for kw in passwords] == EMAILS
    assert all(kw["Password"] == dbi.DEMO_PASSWORD for kw in passwords)
    assert all(kw["Permanent"] is True for kw in passwords)


def test_demo_csv_rows_are_typed(conn):
    """CSV text is turned into real dates, times and timestamps; blank
    submitted_at values become NULL."""
    ready_for_demo(conn)
    dbi.lambda_handler({"action": "demo"})
    values = [v for _, params in conn.ran("INSERT INTO demo_ts") for v in params]
    rows = [tuple(values[i:i + 8]) for i in range(0, len(values), 8)]
    assert len(rows) == len(CSV_ROWS)
    email, code, day, start, end, *_ = rows[0]
    assert email == CSV_ROWS[0]["email"]
    assert code == int(CSV_ROWS[0]["project_code"])
    assert isinstance(day, datetime.date) and start < end
    blank = [r for r, src in zip(rows, CSV_ROWS) if not src["submitted_at"]]
    assert blank and all(r[6] is None for r in blank)


def test_demo_custom_password_and_manager(conn, cognito):
    """testPassword replaces the default, and managerEmail puts that
    existing manager in charge of every new demo team."""
    ready_for_demo(conn)
    conn.on("r.name = 'MANAGER'", {"employee_id": 9})
    dbi.lambda_handler({"action": "demo", "testPassword": "Secret123!",
                        "managerEmail": "Mei@Test.com"})
    passwords = cognito.kwargs("admin_set_user_password")
    assert {kw["Password"] for kw in passwords} == {"Secret123!"}
    assert conn.params("r.name = 'MANAGER'") == [("mei@test.com",)]
    [(_, params)] = conn.ran("UPDATE team SET manager_id")
    assert params == (9, 0)


def test_demo_manager_email_must_be_a_manager(conn, cognito):
    """A managerEmail that isn't an existing manager stops the load
    before anything is written."""
    ready_for_demo(conn)
    result = dbi.lambda_handler({"action": "demo",
                                 "managerEmail": "ana@test.com"})
    assert result["ok"] is False and "Manager role" in result["message"]
    assert conn.executed == [] and cognito.calls == []


@pytest.mark.parametrize("break_db", [
    lambda c: tables_exist(c, "employee"),
    lambda c: c.on("information_schema.columns", []),
    lambda c: c.on("special_type IS NOT NULL", {"n": 2}),
], ids=["no stat_holiday table", "no special_type column", "projects missing"])
def test_demo_refuses_an_unprepared_database(conn, cognito, break_db):
    """Demo data needs the newer schema pieces and the special projects
    that seed creates; without them nothing runs."""
    ready_for_demo(conn)
    break_db(conn)
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"] is False
    assert conn.executed == [] and cognito.calls == []


def test_demo_needs_the_first_admin(conn):
    """Demo data goes on top of a seeded database, never instead of it."""
    ready_for_demo(conn)
    conn.on("FROM employee LIMIT 1", [])
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"] is False and "action: seed" in result["message"]


def test_demo_is_not_loaded_twice(conn, cognito):
    """If the first demo team already exists the load stops, so demo
    people can't be duplicated."""
    ready_for_demo(conn)
    conn.on("FROM team WHERE name", {"x": 1})
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"] is False and conn.executed == []
    assert conn.params("FROM team WHERE name") == [(MANIFEST["teams"][0],)]


def test_demo_csv_mismatch_changes_nothing(conn, cognito):
    """If some CSV rows match no employee or project, all is rolled back
    before any Cognito user is created."""
    ready_for_demo(conn)
    conn.on("INSERT INTO timesheet_entry", [], rowcount=len(CSV_ROWS) - 1)
    result = dbi.lambda_handler({"action": "demo"})
    assert f"Only {len(CSV_ROWS) - 1} of {len(CSV_ROWS)}" in result["message"]
    assert result["ok"] is False and conn.commits == 0
    assert conn.rollbacks == 1 and cognito.calls == []


def test_demo_cognito_clash_deletes_logins_made_so_far(conn, cognito):
    """If the 2nd person already exists in Cognito the DB is rolled back
    and the 1st person's new login is deleted again."""
    ready_for_demo(conn)
    exists = FakeCognito.exceptions.UsernameExistsException()
    cognito.errors[("admin_create_user", "bo@test.com")] = exists
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"] is False and "bo@test.com" in result["message"]
    assert conn.commits == 0 and conn.rollbacks == 1
    assert cognito.users("admin_delete_user") == ["ana@test.com"]


def test_demo_release_failure_undoes_everything(conn, cognito, monkeypatch):
    """A pay period that can't be released aborts the whole load: DB
    rolled back and every new login deleted."""
    ready_for_demo(conn)

    def refuse(*args, **kwargs):
        raise HttpError(409, "3 timesheet entries are not approved yet")

    monkeypatch.setattr(dbi, "release_period", refuse)
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"] is False and "Could not release" in result["message"]
    assert conn.commits == 0
    assert cognito.users("admin_delete_user") == EMAILS


def test_demo_unexpected_error_cleans_up_then_raises(conn, cognito):
    """Unexpected errors still roll back and delete new logins, then
    re-raise so the invoke is marked as failed."""
    ready_for_demo(conn)
    conn.fail_on("UPDATE employee SET cognito_sub", RuntimeError("db down"))
    with pytest.raises(RuntimeError):
        dbi.lambda_handler({"action": "demo"})
    assert conn.commits == 0
    assert cognito.users("admin_delete_user") == ["ana@test.com"]


# ---- reset demo data -------------------------------------------------

def test_reset_without_confirm_only_previews(conn, cognito):
    """Without "confirm": true it reports what would be deleted for the
    manifest's people and changes nothing."""
    ready_for_reset(conn)
    result = dbi.lambda_handler({"action": "reset"})
    assert result["preview"] is True and result["demo_people"] == 2
    assert conn.params("WHERE email = ANY") == [(MANIFEST["emails"],)]
    assert conn.executed == [] and cognito.calls == []


@pytest.mark.parametrize("confirm", ["true", 1, False])
def test_reset_confirm_must_be_real_true(conn, confirm):
    """Only a JSON true confirms; "true", 1 or false still just preview."""
    ready_for_reset(conn)
    result = dbi.lambda_handler({"action": "reset", "confirm": confirm})
    assert result["preview"] is True and conn.executed == []


def test_reset_deletes_children_first_then_logins(conn, cognito):
    """Rows are deleted children-first so no foreign key blocks it, the
    work is committed, and only then are demo logins removed."""
    ready_for_reset(conn)
    result = dbi.lambda_handler({"action": "reset", "confirm": True})
    pattern = r"(?:DELETE FROM|UPDATE) (\w+)"
    targets = [re.match(pattern, sql).group(1) for sql, _ in conn.executed]
    assert targets == RESET_ORDER
    assert conn.commits == 1 and result["ok"]
    assert cognito.users("admin_delete_user") == MANIFEST["emails"]


def test_reset_failure_keeps_cognito_logins(conn, cognito):
    """If a delete fails the DB is rolled back and the Cognito logins are
    kept, so demo users can still sign in."""
    ready_for_reset(conn)
    conn.fail_on("DELETE FROM team", RuntimeError("fk violation"))
    with pytest.raises(RuntimeError):
        dbi.lambda_handler({"action": "reset", "confirm": True})
    assert conn.commits == 0 and cognito.calls == []


def test_reset_refuses_when_others_have_pay_stubs(conn, cognito):
    """If non-demo people have pay stubs, reset refuses: it can't safely
    reopen pay periods they share."""
    ready_for_reset(conn)
    conn.on("AS demo_people", {**PREVIEW, "other_pay_stubs": 4})
    result = dbi.lambda_handler({"action": "reset", "confirm": True})
    assert result["ok"] is False
    assert conn.executed == [] and cognito.calls == []


def test_reset_refuses_when_demo_teams_have_other_people(conn, cognito):
    """Non-demo users in a demo team would lose their team, so reset
    names them and stops."""
    ready_for_reset(conn)
    conn.on("WHERE t.name = ANY", [{"email": "real.person@corp.com"}])
    result = dbi.lambda_handler({"action": "reset", "confirm": True})
    assert result["ok"] is False
    assert "real.person@corp.com" in result["message"]
    assert conn.executed == [] and cognito.calls == []


def test_reset_with_no_demo_people(conn):
    """Nothing to reset is reported plainly, not raised as an error."""
    result = dbi.lambda_handler({"action": "reset", "confirm": True})
    assert result["ok"] is False and "No demo people" in result["message"]


# ---- demo data files -------------------------------------------------

def test_csv_people_and_projects_are_in_the_manifest():
    """Every CSV row belongs to a demo person and a demo or special
    project, so reset removes everything the load added."""
    codes = set(MANIFEST["project_codes"]) | {c for c, _, _ in dbi.SPECIAL_PROJECTS}
    assert {r["email"] for r in CSV_ROWS} <= set(MANIFEST["emails"])
    assert {int(r["project_code"]) for r in CSV_ROWS} <= codes


def test_csv_statuses_have_matching_timestamps():
    """Submitted and approved rows have submitted_at, approved rows also
    reviewed_at, and every shift ends after it starts."""
    for row in CSV_ROWS:
        assert row["status"] in ("draft", "submitted", "approved")
        if row["status"] != "draft":
            assert row["submitted_at"]
        if row["status"] == "approved":
            assert row["reviewed_at"]
        start = datetime.time.fromisoformat(row["start_time"])
        assert start < datetime.time.fromisoformat(row["end_time"])


def test_manifest_matches_demo_data_sql():
    """Every person, team, position and project code reset deletes is one
    demo_data.sql creates, and the SQL adds no unlisted people."""
    sql_emails = set(re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", DEMO_SQL))
    assert sql_emails == set(MANIFEST["emails"])
    for name in MANIFEST["teams"] + MANIFEST["positions"]:
        assert name.replace("'", "''") in DEMO_SQL
    for code in MANIFEST["project_codes"]:
        assert str(code) in DEMO_SQL
