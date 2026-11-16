import types

import pytest

from payroll_common import auth
from payroll_common.auth import assert_self, authenticate, with_auth
from payroll_common.http_utils import HttpError

"""Unit tests for payroll_common.auth, which turns the Cognito user on a
request into an employee and checks the role they are acting as.

Approach: the one database lookup (auth.one) is replaced with a fake
that returns a chosen employee row, so the rules run without Postgres.
"""

MEI = {"employee_id": 7, "status": "ACTIVE", "first_name": "Mei",
       "last_name": "Ross", "team_id": 2, "role": "MANAGER"}


@pytest.fixture
def lookup(monkeypatch):
    """Fakes the employee lookup; set lookup.row (None = no record)."""
    state = types.SimpleNamespace(row=dict(MEI), params=None)

    def fake_one(conn, sql, params):
        state.params = params
        return state.row

    monkeypatch.setattr(auth, "get_conn", lambda: None)
    monkeypatch.setattr(auth, "one", fake_one)
    return state


def event(sub="sub-mei", headers=None):
    claims = {"sub": sub} if sub else {}
    return {"headers": headers,
            "requestContext": {"authorizer": {"claims": claims}}}


# ---- authenticate ----------------------------------------------------

@pytest.mark.parametrize("ev", [
    {},
    {"requestContext": None},
    {"requestContext": {"authorizer": None}},
    event(sub=None),
])
def test_missing_cognito_sub_is_401(lookup, ev):
    """Without a Cognito sub the caller isn't logged in; that's a 401
    and the database is never queried."""
    with pytest.raises(HttpError, match="Unauthenticated") as err:
        authenticate(ev)
    assert err.value.status == 401
    assert lookup.params is None


def test_looks_up_employee_by_cognito_sub(lookup):
    """The employee is found by the token's sub, never by anything the
    client could edit, such as an email in the body."""
    authenticate(event())
    assert lookup.params == ("sub-mei",)


def test_unknown_user_is_403(lookup):
    """A valid login with no employee row (e.g. a user created only in
    Cognito) is refused."""
    lookup.row = None
    with pytest.raises(HttpError, match="No employee record") as err:
        authenticate(event())
    assert err.value.status == 403


def test_deactivated_user_is_403(lookup):
    """Deactivated staff are blocked even if their Cognito token is
    still valid."""
    lookup.row["status"] = "DEACTIVATED"
    with pytest.raises(HttpError, match="deactivated") as err:
        authenticate(event())
    assert err.value.status == 403


@pytest.mark.parametrize("headers", [None, {}])
def test_defaults_to_employee_role(lookup, headers):
    """With no X-Active-Role header everyone acts as a plain employee,
    even managers."""
    ctx = authenticate(event(headers=headers))
    assert ctx["active_role"] == "EMPLOYEE"
    assert ctx["available"] == ["EMPLOYEE", "MANAGER"]
    assert ctx["name"] == "Mei Ross" and ctx["employee_id"] == 7


@pytest.mark.parametrize("headers", [
    {"X-Active-Role": "MANAGER"},
    {"x-active-role": "manager"},
])
def test_active_role_header_is_case_insensitive(lookup, headers):
    """Header names are case-insensitive in HTTP and may arrive
    lowercased; the role value is uppercased too."""
    assert authenticate(event(headers=headers))["active_role"] == "MANAGER"


@pytest.mark.parametrize("role", ["IT", "PAYROLL_ADMIN", "ADMIN"])
def test_cannot_act_as_role_not_held(lookup, role):
    """A manager can't become IT or payroll admin by editing the header,
    and unknown roles are refused too."""
    with pytest.raises(HttpError, match="do not hold") as err:
        authenticate(event(headers={"X-Active-Role": role}))
    assert err.value.status == 403


def test_employee_without_elevated_role(lookup):
    """Staff with no extra role (role is NULL) can only act as EMPLOYEE."""
    lookup.row["role"] = None
    assert authenticate(event())["available"] == ["EMPLOYEE"]
    with pytest.raises(HttpError, match="do not hold"):
        authenticate(event(headers={"X-Active-Role": "MANAGER"}))


# ---- with_auth and assert_self ---------------------------------------

def test_with_auth_passes_context_to_handler(lookup):
    """The handler receives the event plus the resolved user context."""
    wrapped = with_auth(["MANAGER"], lambda e, ctx: ctx["active_role"])
    assert wrapped(event(headers={"X-Active-Role": "MANAGER"})) == "MANAGER"


def test_with_auth_blocks_wrong_active_role(lookup):
    """Holding a role isn't enough, it must be the active one: a manager
    browsing as EMPLOYEE can't hit manager routes."""
    called = []
    wrapped = with_auth(["MANAGER"], lambda e, ctx: called.append(ctx))
    with pytest.raises(HttpError, match="requires the MANAGER role") as err:
        wrapped(event())
    assert err.value.status == 403 and called == []


def test_with_auth_empty_roles_allows_any_user(lookup):
    """An empty role list means any logged-in, active employee."""
    wrapped = with_auth([], lambda e, ctx: ctx["employee_id"])
    assert wrapped(event()) == 7


def test_assert_self_allows_only_own_records():
    """Employees may read their own records; any other id is a 403."""
    ctx = {"employee_id": 7}
    assert_self(ctx, 7)
    with pytest.raises(HttpError, match="your own records") as err:
        assert_self(ctx, 8)
    assert err.value.status == 403
