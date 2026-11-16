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
