import json

import pytest

from helpers.events import api_event
from helpers.pg import insert
from payroll_common import auth
from payroll_common.db import one, query, transaction
from payroll_common.audit import audit
from payroll_common.http_utils import HttpError

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


def test_authenticate_employee_without_elevated_role(base):
    """No role_id means EMPLOYEE only; the team comes from the row."""
    ctx = signed_in("sub-ana")
    assert ctx["role"] is None and ctx["available"] == ["EMPLOYEE"]
    assert ctx["team_id"] == base.team


@pytest.mark.parametrize("sub, change, message", [
    ("sub-nobody", None, "No employee record"),
    ("sub-ana", "DEACTIVATED", "deactivated"),
])
def test_authenticate_refuses_unknown_or_deactivated(conn, base, sub, change,
                                                     message):
    """An unknown sub or a deactivated account is a 403."""
    if change:
        query(conn, "UPDATE employee SET status = %s WHERE employee_id = %s",
              (change, base.ana))
        conn.commit()
    with pytest.raises(HttpError) as err:
        signed_in(sub)
    assert err.value.status == 403 and message in err.value.message


def test_transaction_commits_and_then_sends_audits(conn, base, audits):
    """Rows written in transaction() survive a later rollback, and the
    audit message is sent only after the commit."""
    with transaction() as c:
        row = insert(c, "position", title="Analyst", pay_grade="G2")
        audit(c, None, "position", row["position_id"], "INSERT", None, {})
        assert audits == []
    conn.rollback()
    assert one(conn, "SELECT 1 AS x FROM position WHERE title = 'Analyst'")
    assert [json.loads(m)["table"] for m in audits] == ["position"]
