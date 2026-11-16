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
