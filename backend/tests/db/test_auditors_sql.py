import json

import pytest

from helpers.events import api_event
from helpers.fakes import FakeCognito
from helpers.lambdas import load_lambda
from helpers.pg import insert
from payroll_common import auth
from payroll_common.db import one, query
from payroll_common.http_utils import HttpError

"""Tests for external auditors on a real Postgres: IT's auditor routes,
the sign-in lookup that finds an auditor instead of an employee, what an
auditor may call, and the employee name lookup.

Approach: requests go through the real handlers, sign-in lookup and SQL;
only Cognito is faked. IT acts as Ivy from the base fixture. An auditor
is a row in the auditor table: no position, wage, team or timesheets.
"""

am = load_lambda("account-management")
profiles = load_lambda("employee-profiles")
reader = load_lambda("audit-reader")

NEW_AUDITOR = {"firstName": "Zed", "lastName": "Quinn", "email": "Zed.Quinn@Test.com"}


@pytest.fixture(autouse=True)
def cognito(monkeypatch):
    """Fake Cognito client, so no test can reach a real user pool."""
    fake = FakeCognito()
    monkeypatch.setattr(am, "_cognito", fake)
    monkeypatch.setenv("USER_POOL_ID", "pool-test")
    return fake


def it(method, resource, path=None, query=None, body=None):
    """Sends one request to account-management as Ivy acting as IT."""
    event = api_event(method, resource, role="IT", sub="sub-ivy", path=path,
                      query=query, body=body)
    res = am.lambda_handler(event)
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


def as_auditor(lam, method, resource, sub="sub-zed.quinn@test.com", role=None,
               query=None):
    """Sends one request to a Lambda as the signed-in auditor Zed."""
    event = api_event(method, resource, role=role, sub=sub, query=query)
    res = lam.lambda_handler(event)
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


@pytest.fixture
def zed(base):
    """Zed, created through the real route; returns the auditor body."""
    status, body = it("POST", "/it/auditors", body=NEW_AUDITOR)
    assert status == 201
    return body


# ---- IT's routes -----------------------------------------------------

def test_create_auditor_stores_a_row_and_audits_it(base, cognito, audits):
    """The auditor row gets a lowercase email, the Cognito sub, Ivy as
    creator, status ACTIVE; the audit message has no Cognito sub."""
    status, body = it("POST", "/it/auditors", body=NEW_AUDITOR)
    assert status == 201 and body == {
        "auditorId": body["auditorId"], "firstName": "Zed", "lastName": "Quinn",
        "email": "zed.quinn@test.com", "status": "ACTIVE", "role": "AUDITOR"}
    row = one(am.get_conn(), "SELECT * FROM auditor")
    assert row["cognito_sub"] == "sub-zed.quinn@test.com"
    assert row["created_by"] == base.admin
    assert cognito.names() == ["admin_create_user"]
    [message] = [json.loads(m) for m in audits]
    assert (message["table"], message["action"]) == ("auditor", "INSERT")
    assert "sub-zed" not in json.dumps(message)


def test_auditor_is_not_an_employee(base, zed):
    """Creating an auditor adds no employee row, so they cannot be given
    a position, wage, team or timesheet."""
    n = one(am.get_conn(), "SELECT count(*)::int AS n FROM employee")["n"]
    assert n == 3  # Ivy, Mei and Ana from the base fixture
    status, users = it("GET", "/it/users")
    assert "zed.quinn@test.com" not in [u["email"] for u in users["users"]]


@pytest.mark.parametrize("email", ["ana@test.com", "ANA@Test.com", "zed.quinn@test.com"])
def test_create_auditor_with_taken_email_is_409(base, cognito, zed, email):
    """An email used by an employee or by another auditor is refused
    before any Cognito user is made."""
    cognito.calls.clear()
    status, _ = it("POST", "/it/auditors", body={**NEW_AUDITOR, "email": email})
    assert status == 409 and cognito.calls == []


def test_create_auditor_failure_deletes_the_cognito_user(base, cognito):
    """If the database insert fails (here the Cognito sub is already
    taken), the login made a moment earlier is removed again, so nobody
    is left able to sign in."""
    conn = am.get_conn()
    insert(conn, "auditor", cognito_sub="sub-zed.quinn@test.com",
           first_name="X", last_name="Y", email="other@test.com",
           created_by=base.admin)
    conn.commit()
    status, _ = it("POST", "/it/auditors", body=NEW_AUDITOR)
    assert status == 500
    assert cognito.names() == ["admin_create_user", "admin_delete_user"]


def test_list_and_get_auditors(base, zed):
    """The list is paged and filterable; get returns the same object."""
    it("POST", "/it/auditors", body={"firstName": "Amy", "lastName": "Zhou",
                                     "email": "amy@test.com"})
    status, body = it("GET", "/it/auditors", query={"sort": "name"})
    assert status == 200 and body["total"] == 2
    assert [a["firstName"] for a in body["auditors"]] == ["Zed", "Amy"]
    status, found = it("GET", "/it/auditors", query={"search": "QUINN"})
    assert [a["email"] for a in found["auditors"]] == ["zed.quinn@test.com"]
    status, page = it("GET", "/it/auditors", query={"limit": "1", "offset": "1"})
    assert page["total"] == 2 and len(page["auditors"]) == 1
    status, one_back = it("GET", "/it/auditors/{id}", path={"id": str(zed["auditorId"])})
    assert one_back == zed
    assert it("GET", "/it/auditors/{id}", path={"id": "999"})[0] == 404
    assert it("GET", "/it/auditors", query={"status": "GONE"})[0] == 400


def test_deactivate_blocks_sign_in_and_reactivate_restores_it(base, cognito, zed, audits):
    """Deactivating disables the Cognito login and signs it out; the very
    next request with the old token is refused; reactivating undoes it."""
    path = {"id": str(zed["auditorId"])}
    status, body = it("PATCH", "/it/auditors/{id}/status", path=path, body={"status": "DEACTIVATED"})
    assert status == 200 and body["status"] == "DEACTIVATED"
    assert cognito.names()[1:] == ["admin_disable_user", "admin_user_global_sign_out"]
    status, res = as_auditor(reader, "GET", "/audit/employees", query={"search": "ana"})
    assert status == 403 and "deactivated" in res["error"]
    status, body = it("PATCH", "/it/auditors/{id}/status", path=path, body={"status": "ACTIVE"})
    assert body["status"] == "ACTIVE" and cognito.names()[-1] == "admin_enable_user"
    assert as_auditor(reader, "GET", "/audit/employees", query={"search": "ana"})[0] == 200
    changes = [json.loads(m) for m in audits if json.loads(m)["action"] == "UPDATE"]
    assert [c["newValues"] for c in changes] == [{"status": "DEACTIVATED"}, {"status": "ACTIVE"}]


def test_setting_the_same_status_changes_nothing(base, cognito, zed):
    """Activating an active auditor makes no Cognito call and no audit."""
    cognito.calls.clear()
    status, body = it("PATCH", "/it/auditors/{id}/status",
                      path={"id": str(zed["auditorId"])}, body={"status": "ACTIVE"})
    assert status == 200 and cognito.calls == []


def test_status_of_unknown_auditor_is_404(base):
    """An id that is not an auditor (even a real employee id) is a 404."""
    path = {"id": str(base.ana)}
    assert it("PATCH", "/it/auditors/{id}/status", path=path, body={"status": "ACTIVE"})[0] == 404


def test_reset_password(base, cognito, zed):
    """An active auditor's password is reset in Cognito; a deactivated
    one is refused with 409."""
    path = {"id": str(zed["auditorId"])}
    status, body = it("POST", "/it/auditors/{id}/reset-password", path=path)
    assert status == 200 and cognito.names()[-1] == "admin_reset_user_password"
    it("PATCH", "/it/auditors/{id}/status", path=path, body={"status": "DEACTIVATED"})
    assert it("POST", "/it/auditors/{id}/reset-password", path=path)[0] == 409
    assert it("POST", "/it/auditors/{id}/reset-password", path={"id": "999"})[0] == 404


# ---- signing in as an auditor ----------------------------------------

def test_authenticate_finds_the_auditor(base, zed):
    """No employee has the sub, so the auditor table is used: the only
    role is AUDITOR and there is no employee id."""
    ctx = auth.authenticate(api_event("GET", "/me", sub="sub-zed.quinn@test.com"))
    assert ctx["employee_id"] is None and ctx["auditor_id"] == zed["auditorId"]
    assert ctx["available"] == ["AUDITOR"] and ctx["active_role"] == "AUDITOR"
    assert ctx["name"] == "Zed Quinn"


@pytest.mark.parametrize("role", ["EMPLOYEE", "IT", "MANAGER"])
def test_auditor_cannot_act_as_another_role(base, zed, role):
    """Asking for any role but AUDITOR is a 403."""
    with pytest.raises(HttpError) as err:
        auth.authenticate(api_event("GET", "/me", sub="sub-zed.quinn@test.com", role=role))
    assert err.value.status == 403


def test_me_for_an_auditor(base, zed):
    """GET /me lists only AUDITOR and has no employee id."""
    status, body = as_auditor(profiles, "GET", "/me", role="AUDITOR")
    assert status == 200 and body == {
        "employeeId": None, "auditorId": zed["auditorId"], "firstName": "Zed",
        "lastName": "Quinn", "availableRoles": ["AUDITOR"]}


def test_me_for_an_employee_has_no_auditor_id(base):
    """Employees see the same shape as before."""
    status, body = as_auditor(profiles, "GET", "/me", sub="sub-ana")
    assert status == 200 and "auditorId" not in body
    assert body["availableRoles"] == ["EMPLOYEE"]


def test_unknown_sub_is_still_refused(base):
    """A login in neither table gets the same 403 as before."""
    status, res = as_auditor(reader, "GET", "/audit/employees", sub="sub-nobody")
    assert status == 403 and "No employee record" in res["error"]


@pytest.mark.parametrize("lam, method, resource", [
    (am, "GET", "/it/users"),
    (am, "GET", "/it/auditors"),
    (profiles, "GET", "/employee/{id}/profile"),
])
def test_auditor_is_refused_everywhere_but_the_audit_log(base, zed, lam, method, resource):
    """Every other route is a 403 for an auditor, whatever role they send."""
    event = api_event(method, resource, role="AUDITOR", sub="sub-zed.quinn@test.com",
                      path={"id": "1"})
    res = lam.lambda_handler(event)
    assert res["statusCode"] == 403


def test_employee_cannot_use_the_name_lookup(base):
    """The lookup is for auditors only, even for IT."""
    for sub, role in (("sub-ivy", "IT"), ("sub-mei", "MANAGER"), ("sub-ana", "EMPLOYEE")):
        event = api_event("GET", "/audit/employees", role=role, sub=sub, query={"search": "a"})
        assert reader.lambda_handler(event)["statusCode"] == 403


# ---- employee name lookup --------------------------------------------

def test_lookup_finds_employees_by_name_or_email(base, zed):
    """Matches part of the full name or the email, any case, and returns
    only id, name and email, ordered by last name."""
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": "ANA"})
    assert status == 200
    assert body == {"employees": [{"employeeId": base.ana, "firstName": "Ana",
                                   "lastName": "Test", "email": "ana@test.com"}]}
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": "a t"})
    assert [e["firstName"] for e in body["employees"]] == ["Ana"]
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": "@test.com"})
    assert [e["firstName"] for e in body["employees"]] == ["Ana", "Ivy", "Mei"]
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": "@test.com", "limit": "2"})
    assert len(body["employees"]) == 2


def test_lookup_does_not_find_auditors(base, zed):
    """Auditors are not employees and are not in the lookup."""
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": "zed"})
    assert body == {"employees": []}


@pytest.mark.parametrize("term", ["%", "_", "a%", "\\"])
def test_lookup_treats_wildcards_as_plain_text(base, zed, term):
    """A % or _ typed by the auditor does not match everything."""
    status, body = as_auditor(reader, "GET", "/audit/employees", query={"search": term})
    assert status == 200 and body == {"employees": []}


@pytest.mark.parametrize("params", [{}, {"search": ""}, {"search": "   "},
                                    {"search": "x" * 101}, {"search": "a", "limit": "0"},
                                    {"search": "a", "limit": "51"}, {"search": "a", "limit": "x"}])
def test_lookup_validates_input(base, zed, params):
    """A missing or oversized search, or a bad limit, is a 400."""
    status, _ = as_auditor(reader, "GET", "/audit/employees", query=params or None)
    assert status == 400
