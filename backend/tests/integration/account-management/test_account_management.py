import datetime
import json

import pytest

from helpers.events import api_event
from helpers.fakes import FakeCognito, FakeDB
from helpers.lambdas import load_lambda
from payroll_common import auth

"""Tests for the account-management Lambda: IT's routes for user
accounts, roles, teams and positions.

Approach: requests go through the Lambda's real router and role checks,
but SQL (one/query/transaction), Cognito and audit are fakes that record
every call. Tests answer SQL by text fragment, then assert on both the
response and what was (or wasn't) written.
"""

am = load_lambda("account-management")

NEW_SUB = "sub-ada@example.com"
IT_ROW = {"employee_id": 1, "status": "ACTIVE", "first_name": "Ivy",
          "last_name": "Tran", "team_id": None, "role": "IT"}
USER_ROW = {
    "employee_id": 42, "first_name": "Ada", "last_name": "Lovelace",
    "email": "ada@example.com", "phone": None, "street": None,
    "city": None, "province": None, "postal_code": None, "country": None,
    "status": "ACTIVE", "hire_date": datetime.date(2026, 11, 2),
    "role": "EMPLOYEE", "position_id": 3, "position": "Analyst",
    "team_id": 2, "team": "Ops", "manager_id": 7, "manager_name": "Mei Ross",
}
OLD_EMPLOYEE = {"employee_id": 42, "email": "ada@example.com",
                "position_id": 3, "team_id": 2, "cognito_sub": "sub-ada",
                "first_name": "Ada", "last_name": "Lovelace"}
ACTIVE_LOGIN = {"status": "ACTIVE", "cognito_sub": "sub-ada"}
TEAM_ROW = {"team_id": 9, "name": "Ops", "manager_id": 7,
            "manager_name": "Mei Ross", "member_count": 0}
VALID_ACCOUNT = {"firstName": "Ada", "lastName": "Lovelace",
                 "email": "Ada@Example.com", "positionId": 3,
                 "hireDate": "2026-11-02"}
STATUS_ROUTE = "/it/users/{id}/status"
ROLE_ROUTE = "/it/users/{id}/role"
ROUTES = [
    ("POST", "/it/create-account"),
    ("GET", "/it/users"),
    ("GET", "/it/users/{id}"),
    ("POST", "/it/users/{id}/reset-password"),
    ("PATCH", "/it/users/{id}"),
    ("PATCH", STATUS_ROUTE),
    ("PATCH", ROLE_ROUTE),
    ("GET", "/it/teams"),
    ("POST", "/it/teams"),
    ("PATCH", "/it/teams/{id}"),
    ("GET", "/it/positions"),
]


@pytest.fixture(autouse=True)
def caller(monkeypatch):
    """The signed-in user: an IT employee unless a test changes it."""
    row = dict(IT_ROW)
    monkeypatch.setattr(auth, "get_conn", lambda: None)
    monkeypatch.setattr(auth, "one", lambda conn, sql, params: row)
    return row


@pytest.fixture(autouse=True)
def db(monkeypatch):
    """Fake SQL layer with the rows most tests need already answered."""
    fake = FakeDB()
    fake.on("WHERE e.employee_id", USER_ROW)
    fake.on("FROM position WHERE position_id", {"x": 1})
    fake.on("FROM team WHERE team_id", {"x": 1})
    fake.on("INSERT INTO employee", {"employee_id": 42})
    for name in ("one", "query", "transaction"):
        monkeypatch.setattr(am, name, getattr(fake, name))
    monkeypatch.setattr(am, "get_conn", lambda: "conn")
    return fake


@pytest.fixture(autouse=True)
def cognito(monkeypatch):
    """Fake Cognito client, so no test can reach a real user pool."""
    fake = FakeCognito()
    monkeypatch.setattr(am, "_cognito", fake)
    monkeypatch.setenv("USER_POOL_ID", "pool-test")
    return fake


@pytest.fixture(autouse=True)
def audits(monkeypatch):
    """Collects audit() calls as dicts instead of sending them to SQS."""
    log = []

    def record(conn, ctx, table, record_id, action, old, new):
        log.append({"table": table, "id": record_id, "action": action,
                    "old": old, "new": new})

    monkeypatch.setattr(am, "audit", record)
    return log


def call(method, resource, path=None, query=None, body=None, role="IT"):
    event = api_event(method, resource, role=role, path=path, query=query,
                      body=body)
    res = am.lambda_handler(event)
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


# ---- access control --------------------------------------------------

@pytest.mark.parametrize("method, resource", ROUTES)
def test_every_route_requires_it_role(caller, db, cognito, method, resource):
    """All 11 routes refuse a manager acting as MANAGER, before any SQL
    or Cognito call is made."""
    caller["role"] = "MANAGER"
    status, _ = call(method, resource, role="MANAGER", path={"id": "42"})
    assert status == 403
    assert db.calls == [] and cognito.calls == []


# ---- configuration ---------------------------------------------------

def test_cognito_client_is_created_once(monkeypatch):
    """The boto3 client is built on first use, then reused by later
    calls in the same warm Lambda."""
    made = []
    monkeypatch.setattr(am, "_cognito", None)
    monkeypatch.setattr(am.boto3, "client",
                        lambda name: made.append(name) or object())
    assert am.cognito() is am.cognito()
    assert made == ["cognito-idp"]


def test_missing_user_pool_id_is_500(monkeypatch, db, cognito):
    """A deploy without USER_POOL_ID fails with a generic 500 before any
    Cognito call, rather than calling an undefined pool."""
    monkeypatch.delenv("USER_POOL_ID")
    status, res = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 500 and "USER_POOL_ID" not in res["error"]
    assert cognito.calls == [] and db.ran("INSERT INTO employee") == []


# ---- create account --------------------------------------------------

def test_create_account_success(db, cognito, audits):
    """Creates the Cognito user first, stores its sub on the new
    employee row, audits the INSERT and commits."""
    status, body = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 201 and body["employeeId"] == 42
    assert cognito.names() == ["admin_create_user"]
    assert cognito.calls[0][1]["Username"] == "ada@example.com"
    [(_, params)] = db.ran("INSERT INTO employee")
    assert params[0] == NEW_SUB and params[3] == "ada@example.com"
    assert [(a["table"], a["action"]) for a in audits] == [("employee", "INSERT")]
    assert db.commits == 1


def test_create_account_with_elevated_role(db):
    """An elevated role is looked up by name and stored as its role_id."""
    db.on("FROM role WHERE name", {"role_id": 2})
    body = {**VALID_ACCOUNT, "role": "MANAGER"}
    status, _ = call("POST", "/it/create-account", body=body)
    [(_, params)] = db.ran("INSERT INTO employee")
    assert status == 201 and params[10] == 2


@pytest.mark.parametrize("change", [
    {"firstName": ""},
    {"email": "not-an-email"},
    {"phone": "604-555-0142"},
    {"hireDate": "2026-02-30"},
    {"role": "ADMIN"},
])
def test_create_account_validates_before_side_effects(db, cognito, change):
    """Bad input is a 400 before any SQL or Cognito call, so no
    half-created account is left behind."""
    status, _ = call("POST", "/it/create-account", body={**VALID_ACCOUNT, **change})
    assert status == 400
    assert db.calls == [] and cognito.calls == []


def test_create_account_duplicate_email_in_db(db, cognito):
    """An email already in the employee table is a 409, and no Cognito
    user is created."""
    db.on("FROM employee WHERE email", {"x": 1})
    status, body = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 409 and "already exists" in body["error"]
    assert cognito.calls == []


def test_create_account_duplicate_email_in_cognito(db, cognito):
    """If Cognito already has the email it's a 409, and no employee row
    is inserted."""
    exists = FakeCognito.exceptions.UsernameExistsException()
    cognito.errors["admin_create_user"] = exists
    status, body = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 409 and "user pool" in body["error"]
    assert db.ran("INSERT INTO employee") == []


def test_create_account_rolls_back_cognito_on_db_failure(db, cognito, audits):
    """A bad positionId fails inside the transaction; the Cognito user
    just created is deleted so the two stores stay in sync."""
    db.on("FROM position WHERE position_id", None)
    status, body = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 400 and "positionId 3 does not exist" in body["error"]
    assert cognito.names() == ["admin_create_user", "admin_delete_user"]
    assert cognito.calls[1][1]["Username"] == NEW_SUB
    assert db.rollbacks == 1 and audits == []


def test_create_account_cleanup_failure_keeps_original_error(db, cognito):
    """If deleting the Cognito user also fails, the client still gets
    the real error (400), not the cleanup error."""
    db.on("FROM position WHERE position_id", None)
    cognito.errors["admin_delete_user"] = RuntimeError("Cognito down")
    status, _ = call("POST", "/it/create-account", body=VALID_ACCOUNT)
    assert status == 400


# ---- list and read users ---------------------------------------------

def test_list_users_applies_filters_paging_and_sort(db):
    """Every filter becomes a bound parameter (search gets % wildcards
    on both sides), and total comes from the window count."""
    db.on("COUNT(*) OVER()", [{**USER_ROW, "total_count": 3}])
    query = {"status": "ACTIVE", "role": "MANAGER", "teamId": "2",
             "search": "ada", "sort": "name", "order": "desc",
             "limit": "10", "offset": "20"}
    status, body = call("GET", "/it/users", query=query)
    [(sql, params)] = db.ran("COUNT(*) OVER()")
    assert params == ["ACTIVE", "MANAGER", 2, "%ada%", "%ada%", 10, 20]
    assert "ORDER BY u.last_name, u.first_name DESC" in sql
    assert status == 200 and body["total"] == 3
    assert body["users"][0]["employeeId"] == 42


def test_list_users_empty_result_has_zero_total(db):
    """With no matching rows total is 0 rather than a crash on rows[0]."""
    status, body = call("GET", "/it/users")
    assert status == 200 and body["total"] == 0 and body["users"] == []


def test_list_users_rejects_bad_filter(db):
    """Filter values are checked against fixed lists before any SQL."""
    status, _ = call("GET", "/it/users", query={"status": "active"})
    assert status == 400 and db.calls == []


def test_get_user_not_found(db):
    """An unknown employee id is a 404, not a 500 on a missing row."""
    db.on("WHERE e.employee_id", None)
    status, _ = call("GET", "/it/users/{id}", path={"id": "999"})
    assert status == 404


# ---- reset password --------------------------------------------------

def test_reset_password_goes_through_cognito(db, cognito, audits):
    """Cognito emails the reset code, keyed by the user's sub; the audit
    entry notes the reset without any password value."""
    db.on("SELECT cognito_sub FROM employee", {"cognito_sub": "sub-ada"})
    status, _ = call("POST", "/it/users/{id}/reset-password", path={"id": "42"})
    assert status == 200
    assert cognito.calls == [("admin_reset_user_password",
                              {"UserPoolId": "pool-test", "Username": "sub-ada"})]
    assert audits[0]["new"] == {"password": "reset initiated"}


def test_reset_password_refused_for_deactivated_user(db, cognito):
    """Deactivated accounts can't be revived through a password reset."""
    db.on("WHERE e.employee_id", {**USER_ROW, "status": "DEACTIVATED"})
    status, _ = call("POST", "/it/users/{id}/reset-password", path={"id": "42"})
    assert status == 409 and cognito.calls == []


# ---- update user -----------------------------------------------------

def test_update_email_syncs_cognito(db, cognito, audits):
    """A new email is saved, copied to the user's Cognito attributes,
    and audited with old and new values."""
    db.on("SELECT * FROM employee WHERE employee_id", OLD_EMPLOYEE)
    status, _ = call("PATCH", "/it/users/{id}", path={"id": "42"},
                     body={"email": "Ada.L@example.com"})
    [(_, params)] = db.ran("UPDATE employee SET")
    assert status == 200 and params == ["ada.l@example.com", 42]
    assert cognito.names() == ["admin_update_user_attributes"]
    assert cognito.calls[0][1]["Username"] == "sub-ada"
    assert audits[0]["old"] == {"email": "ada@example.com"}
    assert audits[0]["new"] == {"email": "ada.l@example.com"}


def test_update_email_already_taken(db, cognito):
    """Switching to another user's email is a 409; nothing is written."""
    db.on("SELECT * FROM employee WHERE employee_id", OLD_EMPLOYEE)
    db.on("FROM employee WHERE email", {"x": 1})
    status, _ = call("PATCH", "/it/users/{id}", path={"id": "42"},
                     body={"email": "mei.ross@example.com"})
    assert status == 409 and db.rollbacks == 1
    assert db.ran("UPDATE employee") == [] and cognito.calls == []


def test_update_same_email_skips_checks(db, cognito):
    """Re-sending the current email isn't a duplicate and doesn't touch
    Cognito."""
    db.on("SELECT * FROM employee WHERE employee_id", OLD_EMPLOYEE)
    db.on("FROM employee WHERE email", {"x": 1})
    status, _ = call("PATCH", "/it/users/{id}", path={"id": "42"},
                     body={"email": "ada@example.com"})
    assert status == 200 and cognito.calls == []


def test_update_with_no_fields_is_400(db):
    """An empty PATCH is rejected before a transaction is opened."""
    status, body = call("PATCH", "/it/users/{id}", path={"id": "42"}, body={})
    assert status == 400 and "No updatable fields" in body["error"]
    assert db.calls == []


def test_update_unknown_user_is_404(db):
    """Updating an id with no employee row is a 404."""
    status, _ = call("PATCH", "/it/users/{id}", path={"id": "999"},
                     body={"firstName": "Ada"})
    assert status == 404


# ---- status and role -------------------------------------------------

def test_cannot_deactivate_yourself(db):
    """IT can't lock themselves out by deactivating their own account."""
    status, _ = call("PATCH", STATUS_ROUTE, path={"id": "1"},
                     body={"status": "DEACTIVATED"})
    assert status == 400 and db.calls == []


def test_deactivate_manager_with_team_is_409(db, cognito):
    """A manager whose team still has active members can't be
    deactivated; the error names the teams to reassign."""
    db.on("SELECT status, cognito_sub FROM employee", ACTIVE_LOGIN)
    db.on("FROM team t WHERE t.manager_id", [{"name": "Ops"}])
    status, body = call("PATCH", STATUS_ROUTE, path={"id": "42"},
                        body={"status": "DEACTIVATED"})
    assert status == 409 and body["details"] == {"teams": ["Ops"]}
    assert db.ran("UPDATE employee") == [] and cognito.calls == []


def test_deactivate_disables_and_signs_out(db, cognito, audits):
    """Deactivating disables the Cognito user and signs them out on
    every device, then audits the status change."""
    db.on("SELECT status, cognito_sub FROM employee", ACTIVE_LOGIN)
    status, _ = call("PATCH", STATUS_ROUTE, path={"id": "42"},
                     body={"status": "DEACTIVATED"})
    assert status == 200
    assert cognito.names() == ["admin_disable_user", "admin_user_global_sign_out"]
    assert audits[0]["new"] == {"status": "DEACTIVATED"}


def test_reactivate_enables_cognito_user(db, cognito):
    """Reactivating re-enables the same Cognito user."""
    db.on("SELECT status, cognito_sub FROM employee",
          {**ACTIVE_LOGIN, "status": "DEACTIVATED"})
    status, _ = call("PATCH", STATUS_ROUTE, path={"id": "42"},
                     body={"status": "ACTIVE"})
    assert status == 200 and cognito.names() == ["admin_enable_user"]


def test_same_status_is_a_no_op(db, cognito, audits):
    """Setting the status a user already has writes nothing, calls no
    Cognito API and adds no audit entry."""
    db.on("SELECT status, cognito_sub FROM employee", ACTIVE_LOGIN)
    status, _ = call("PATCH", STATUS_ROUTE, path={"id": "42"},
                     body={"status": "ACTIVE"})
    assert status == 200
    assert db.ran("UPDATE employee") == [] and cognito.calls == []
    assert audits == []


def test_cannot_change_own_role(db):
    """IT can't promote or demote themselves."""
    status, _ = call("PATCH", ROLE_ROUTE, path={"id": "1"}, body={"role": "MANAGER"})
    assert status == 400 and db.calls == []


def test_role_is_required(db):
    """The role key must be present; null means "no elevated role"."""
    status, body = call("PATCH", ROLE_ROUTE, path={"id": "42"}, body={})
    assert status == 400 and "role is required" in body["error"]


def test_demoting_a_team_manager_is_409(db, audits):
    """Someone who still manages a team can't lose the MANAGER role
    until the team gets another manager."""
    db.on("SELECT role_id FROM employee", {"role_id": 2})
    db.on("FROM team WHERE manager_id", {"x": 1})
    status, _ = call("PATCH", ROLE_ROUTE, path={"id": "42"}, body={"role": None})
    assert status == 409
    assert db.ran("UPDATE employee") == [] and audits == []


def test_promote_to_it_stores_role_id(db, audits):
    """A new role is saved by its role_id and audited old -> new."""
    db.on("SELECT role_id FROM employee", {"role_id": None})
    db.on("FROM role WHERE name", {"role_id": 4})
    status, _ = call("PATCH", ROLE_ROUTE, path={"id": "42"}, body={"role": "IT"})
    [(_, params)] = db.ran("UPDATE employee SET role_id")
    assert status == 200 and params == (4, 42)
    assert audits[0]["old"] == {"role_id": None}
    assert audits[0]["new"] == {"role_id": 4}


# ---- teams and positions ---------------------------------------------

def test_create_team(db, audits):
    """A team needs a name and a manager who holds the MANAGER role;
    the new team is returned with 201."""
    db.on("SELECT r.name AS role", {"role": "MANAGER"})
    db.on("INSERT INTO team", {"team_id": 9})
    db.on("WHERE t.team_id", TEAM_ROW)
    status, body = call("POST", "/it/teams", body={"name": "Ops", "managerId": 7})
    assert status == 201 and body["teamId"] == 9
    assert body["managerName"] == "Mei Ross"
    assert audits[0]["new"] == {"name": "Ops", "manager_id": 7}


def test_create_team_manager_must_hold_manager_role(db):
    """Only users with the MANAGER role can be put in charge of a team."""
    db.on("SELECT r.name AS role", {"role": None})
    status, body = call("POST", "/it/teams", body={"name": "Ops", "managerId": 42})
    assert status == 400 and "Manager role" in body["error"]
    assert db.ran("INSERT INTO team") == []


def test_create_team_duplicate_name_is_409(db):
    """Team names are unique (the SQL compares lower(name), so case
    doesn't matter); a clash is a 409."""
    db.on("SELECT r.name AS role", {"role": "MANAGER"})
    db.on("WHERE lower(name)", {"x": 1})
    status, _ = call("POST", "/it/teams", body={"name": "OPS", "managerId": 7})
    assert status == 409 and db.ran("INSERT INTO team") == []


def test_delete_team_with_members_is_409(db, audits):
    """A team that still has members can't be deleted; they must be
    moved first."""
    db.on("SELECT * FROM team WHERE team_id", TEAM_ROW)
    db.on("FROM employee WHERE team_id", {"x": 1})
    status, _ = call("PATCH", "/it/teams/{id}", path={"id": "9"},
                     body={"isDeleted": True})
    assert status == 409 and audits == []


def test_delete_empty_team_is_soft_delete(db, audits):
    """Deleting sets is_deleted (204, no body) and is audited as DELETE."""
    db.on("SELECT * FROM team WHERE team_id", TEAM_ROW)
    status, body = call("PATCH", "/it/teams/{id}", path={"id": "9"},
                        body={"isDeleted": True})
    assert status == 204 and body is None
    assert db.ran("UPDATE team SET is_deleted = true")
    assert audits[0]["action"] == "DELETE"


def test_delete_flag_must_be_true(db):
    """isDeleted: false is rejected rather than read as "don't delete"."""
    status, _ = call("PATCH", "/it/teams/{id}", path={"id": "9"},
                     body={"isDeleted": False})
    assert status == 400 and db.calls == []


def test_list_positions_never_returns_wages(db):
    """The dropdown data has id, title and pay grade only; wages aren't
    even selected."""
    db.on("FROM position WHERE NOT is_deleted",
          [{"position_id": 3, "title": "Analyst", "pay_grade": "P2"}])
    status, body = call("GET", "/it/positions")
    [(sql, _)] = db.ran("FROM position WHERE NOT is_deleted")
    assert status == 200 and "wage" not in sql
    assert body["positions"] == [
        {"positionId": 3, "title": "Analyst", "payGrade": "P2"},
    ]
