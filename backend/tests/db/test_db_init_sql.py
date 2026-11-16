import csv
import datetime
import json

import pytest

from helpers.fakes import FakeCognito
from helpers.lambdas import DB_DIR, load_lambda
from payroll_common import payroll
from payroll_common.db import one, query

"""Tests for the db-init Lambda on a real Postgres: schema, first admin,
and the full demo load and reset with the real files in backend/db.

Approach: the Lambda runs unchanged against a fresh database; only
Cognito is faked. "Today" is pinned to the manifest's release date, so
the demo releases the same pay periods whatever the real date is.
"""

dbi = load_lambda("db-init")

MANIFEST = json.loads((DB_DIR / "demo_manifest.json").read_text("utf-8"))
with open(DB_DIR / "demo_timesheets.csv", encoding="utf-8", newline="") as f:
    CSV_ROWS = sum(1 for _ in csv.DictReader(f))
ADMIN = {"email": "ivy@example.com", "firstName": "Ivy", "lastName": "Tran"}
TODAY = datetime.date.fromisoformat(MANIFEST["release_before"])


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    """Fake Cognito, the real backend/db files, and a pinned today."""
    fake = FakeCognito()
    monkeypatch.setattr(dbi, "_cognito", fake)
    monkeypatch.setenv("USER_POOL_ID", "pool-test")
    monkeypatch.setattr(dbi, "__file__", str(DB_DIR / "lambda_function.py"))
    monkeypatch.setattr(payroll, "today_bc", lambda: TODAY)
    return fake


def count(conn, sql):
    return one(conn, f"SELECT count(*)::int AS n FROM {sql}")["n"]


def test_schema_action_loads_schema_once(empty_conn):
    """On an empty database the schema action creates all 13 tables; a
    second run changes nothing."""
    assert dbi.lambda_handler({"action": "schema"}) == {
        "ok": True, "message": "Schema loaded.", "tables": 13}
    again = dbi.lambda_handler({"action": "schema"})
    assert again["ok"] is False and "already loaded" in again["message"]


def test_seed_creates_the_first_admin_for_real(conn):
    """Seed writes the IT admin, their position and wage, and the sick,
    vacation and misc projects; a second seed is refused."""
    result = dbi.lambda_handler({"action": "seed", **ADMIN})
    row = one(conn, """SELECT e.cognito_sub, r.name AS role, w.hourly_wage
                         FROM employee e JOIN role r USING (role_id)
                         JOIN position_wage w USING (position_id)""")
    assert result["ok"] and row["cognito_sub"] == "sub-ivy@example.com"
    assert row["role"] == "IT" and str(row["hourly_wage"]) == "40.00"
    kinds = query(conn, "SELECT special_type FROM project ORDER BY project_code")
    assert [r["special_type"] for r in kinds] == ["SICK", "VAC", "MISC"]
    assert dbi.lambda_handler({"action": "seed", **ADMIN})["ok"] is False


def test_demo_loads_every_file_and_releases_periods(conn, setup):
    """demo_data.sql and all CSV rows load, every demo person gets a
    login, and past periods are released with real paystubs."""
    dbi.lambda_handler({"action": "seed", **ADMIN})
    result = dbi.lambda_handler({"action": "demo"})
    assert result["ok"], result["message"]
    assert result["employees"] == len(MANIFEST["emails"])
    assert result["csvTimesheetRows"] == CSV_ROWS
    assert count(conn, "timesheet_entry") == CSV_ROWS
    released = count(conn, "pay_period WHERE status = 'RELEASED'")
    assert released == result["releasedPayPeriods"] > 0
    assert result["pay_stubs"] == count(conn, "paystub") > 0
    assert sorted(setup.users("admin_set_user_password")) == sorted(
        MANIFEST["emails"])
    assert count(conn, "employee WHERE cognito_sub LIKE 'sub-%@test.com'") \
        == len(MANIFEST["emails"])


def test_reset_removes_only_the_demo_data(conn, setup):
    """Reset previews first, then deletes every demo row and login while
    keeping the first admin and the special projects."""
    dbi.lambda_handler({"action": "seed", **ADMIN})
    dbi.lambda_handler({"action": "demo"})
    preview = dbi.lambda_handler({"action": "reset"})
    assert preview["preview"] and count(conn, "paystub") > 0
    result = dbi.lambda_handler({"action": "reset", "confirm": True})
    assert result["ok"]
    assert count(conn, "employee") == 1 and count(conn, "team") == 0
    assert count(conn, "paystub") == 0 and count(conn, "timesheet_entry") == 0
    assert count(conn, "pay_period WHERE status = 'RELEASED'") == 0
    assert count(conn, "project") == 3
    assert sorted(setup.users("admin_delete_user")) == sorted(MANIFEST["emails"])
