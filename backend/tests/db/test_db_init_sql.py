import datetime
import json

import pytest

from helpers.fakes import FakeCognito
from helpers.lambdas import DB_DIR, load_lambda
from payroll_common import payroll
"""Tests for the db-init Lambda on a real Postgres: schema, first admin,
and the full demo load and reset with the real files in backend/db.

Approach: the Lambda runs unchanged against a fresh database; only
Cognito is faked. "Today" is pinned to the manifest's release date, so
the demo releases the same pay periods whatever the real date is.
"""

dbi = load_lambda("db-init")

MANIFEST = json.loads((DB_DIR / "demo_manifest.json").read_text("utf-8"))
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
