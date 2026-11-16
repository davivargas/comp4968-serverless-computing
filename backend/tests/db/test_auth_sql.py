from helpers.events import api_event
from payroll_common import auth
from payroll_common.db import one, query, transaction
"""Tests for payroll_common.auth and db.transaction on a real Postgres:
the sign-in lookup every route runs, and real commits and rollbacks.

Approach: conftest.py points the shared connection (db._conn) at a fresh
database, so get_conn() and transaction() use it exactly as a Lambda
would. Committed rows from the base fixture play the signed-in users.
"""


def signed_in(sub, role="EMPLOYEE"):
    """Runs the real sign-in lookup for a Cognito sub and active role."""
    return auth.authenticate(api_event("GET", "/me", sub=sub, role=role))


def test_authenticate_finds_the_employee_and_role(base):
    """The Cognito sub finds the employee, and the role join gives the
    roles they may act as."""
    ctx = signed_in("sub-mei", role="MANAGER")
    assert ctx["employee_id"] == base.mei and ctx["name"] == "Mei Test"
    assert ctx["role"] == "MANAGER" and ctx["active_role"] == "MANAGER"
    assert ctx["available"] == ["EMPLOYEE", "MANAGER"]
