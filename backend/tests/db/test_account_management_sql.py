import json

import pytest

from helpers.events import api_event
from helpers.fakes import FakeCognito
from helpers.lambdas import load_lambda
from payroll_common.db import one

"""Tests for the account-management Lambda on a real Postgres: its user
and team queries, joins and checks run against real tables.

Approach: requests go through the real handler, sign-in lookup and SQL;
only Cognito is faked. The caller is Ivy, the IT admin from the base
fixture (Mei manages team Platform, Ana is a developer on it).
"""

am = load_lambda("account-management")

NEW_USER = {"firstName": "Bo", "lastName": "Kim", "email": "Bo.Kim@Test.com",
            "hireDate": "2026-03-02", "role": "PAYROLL_ADMIN"}


@pytest.fixture(autouse=True)
def cognito(monkeypatch):
    """Fake Cognito client, so no test can reach a real user pool."""
    fake = FakeCognito()
    monkeypatch.setattr(am, "_cognito", fake)
    monkeypatch.setenv("USER_POOL_ID", "pool-test")
    return fake


def call(method, resource, path=None, query=None, body=None):
    """Sends one request as Ivy acting as IT."""
    event = api_event(method, resource, role="IT", sub="sub-ivy", path=path,
                      query=query, body=body)
    res = am.lambda_handler(event)
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


def test_create_account_then_read_it_back(base):
    """A new account is stored with a lowercase email and role id, and
    reading it back joins position, team and manager names."""
    body = {**NEW_USER, "positionId": base.dev_position, "teamId": base.team}
    status, created = call("POST", "/it/create-account", body=body)
    assert status == 201
    status, user = call("GET", "/it/users/{id}",
                        path={"id": str(created["employeeId"])})
    assert user["email"] == "bo.kim@test.com" and user["role"] == "PAYROLL_ADMIN"
    assert user["position"] == "Developer" and user["team"] == "Platform"
    assert user["managerName"] == "Mei Test"
    assert user["hireDate"] == "2026-03-02"


def test_create_account_with_taken_email_is_409(base, cognito):
    """The duplicate check finds an existing email whatever its case,
    before any Cognito user is made."""
    body = {**NEW_USER, "email": "ANA@test.com", "positionId": base.dev_position}
    status, _ = call("POST", "/it/create-account", body=body)
    assert status == 409 and cognito.calls == []


@pytest.mark.parametrize("query, names, total", [
    ({"sort": "name", "limit": "2"}, ["Ana", "Ivy"], 3),
    ({"role": "MANAGER"}, ["Mei"], 1),
    ({"role": "EMPLOYEE"}, ["Ana"], 1),
    ({"search": "MEI@"}, ["Mei"], 1),
])
def test_list_users_filters_and_counts(base, query, names, total):
    """Filters, case-insensitive search, sorting and paging run in SQL,
    and total counts every match, not just the page."""
    status, body = call("GET", "/it/users", query=query)
    assert status == 200 and body["total"] == total
    assert [u["firstName"] for u in body["users"]] == names


def test_teams_list_counts_members(base):
    """Each team shows its manager's name and how many people are on
    it."""
    status, body = call("GET", "/it/teams")
    assert body["teams"] == [{"teamId": base.team, "name": "Platform",
                              "managerId": base.mei, "managerName": "Mei Test",
                              "memberCount": 1}]


def test_team_rules_hold_against_real_rows(base):
    """A name clash (any case) and deleting a team with members are both
    refused; once Ana moves off the team it can be deleted."""
    status, _ = call("POST", "/it/teams", body={"name": "platform",
                                                "managerId": base.mei})
    assert status == 409
    route, path = "/it/teams/{id}", {"id": str(base.team)}
    status, _ = call("PATCH", route, path=path, body={"isDeleted": True})
    assert status == 409
    call("PATCH", "/it/users/{id}", path={"id": str(base.ana)},
         body={"teamId": None})
    status, _ = call("PATCH", route, path=path, body={"isDeleted": True})
    assert status == 204
    status, body = call("GET", "/it/teams")
    assert body["teams"] == []


def test_manager_with_active_team_cannot_be_deactivated(conn, base, cognito):
    """Mei still has an active member, so deactivating her is refused
    by name; after Ana is deactivated it goes through."""
    route = "/it/users/{id}/status"
    status, body = call("PATCH", route, path={"id": str(base.mei)},
                        body={"status": "DEACTIVATED"})
    assert status == 409 and body["details"] == {"teams": ["Platform"]}
    call("PATCH", route, path={"id": str(base.ana)},
         body={"status": "DEACTIVATED"})
    status, _ = call("PATCH", route, path={"id": str(base.mei)},
                     body={"status": "DEACTIVATED"})
    assert status == 200
    row = one(conn, "SELECT status FROM employee WHERE employee_id = %s",
              (base.mei,))
    assert row["status"] == "DEACTIVATED"
    assert cognito.users("admin_disable_user") == ["sub-ana", "sub-mei"]
