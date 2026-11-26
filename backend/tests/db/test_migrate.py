import pytest

from helpers.fakes import FakeCognito
from helpers.lambdas import DB_DIR, load_lambda
from payroll_common.db import query

"""Tests for db-init's migrate action on a real Postgres.

Approach: an "old" database is a fresh one with the newest additions
dropped again (here the auditor table). Migrating it must give exactly
the same tables, columns, constraints and indexes as schema.sql, so the
two files cannot drift apart. Running migrate twice must be harmless.
"""

dbi = load_lambda("db-init")

CATALOG = {
    "columns": """SELECT table_name, column_name, data_type, character_maximum_length,
                         numeric_precision, numeric_scale, is_nullable,
                         column_default, is_identity
                    FROM information_schema.columns
                   WHERE table_schema = 'public' ORDER BY 1, 2""",
    "constraints": """SELECT conrelid::regclass::text AS tbl, conname,
                             pg_get_constraintdef(oid) AS definition
                        FROM pg_constraint
                       WHERE connamespace = 'public'::regnamespace
                       ORDER BY 1, 2""",
    "indexes": """SELECT tablename, indexname, indexdef FROM pg_indexes
                   WHERE schemaname = 'public' ORDER BY 1, 2""",
}


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    """The real backend/db files, and a fake Cognito nobody calls."""
    monkeypatch.setattr(dbi, "_cognito", FakeCognito())
    monkeypatch.setattr(dbi, "__file__", str(DB_DIR / "lambda_function.py"))


def old_database(make_db):
    """A database from before the auditor table existed."""
    conn = make_db()
    cur = conn.cursor()
    cur.execute("DROP TABLE auditor")
    conn.commit()
    cur.close()
    return conn


def test_migrate_adds_the_auditor_table_to_an_old_database(make_db):
    """The table is created once; a second run reports nothing added."""
    conn = old_database(make_db)
    first = dbi.lambda_handler({"action": "migrate"})
    again = dbi.lambda_handler({"action": "migrate"})
    assert first["ok"] and first["auditorTableAdded"] is True
    assert again["ok"] and again["auditorTableAdded"] is False
    assert query(conn, "SELECT count(*)::int AS n FROM auditor")[0]["n"] == 0


def test_migrated_database_matches_a_fresh_one(make_db):
    """Columns, constraints and indexes are identical to schema.sql."""
    fresh = make_db()
    old = old_database(make_db)
    dbi.lambda_handler({"action": "migrate"})
    for name, sql in CATALOG.items():
        assert query(old, sql) == query(fresh, sql), name


def test_migrate_on_a_current_database_changes_nothing(make_db):
    """On a database that already has everything, migrate is a no-op."""
    conn = make_db()
    before = {name: query(conn, sql) for name, sql in CATALOG.items()}
    result = dbi.lambda_handler({"action": "migrate"})
    assert result["ok"] and result["auditorTableAdded"] is False
    assert {name: query(conn, sql) for name, sql in CATALOG.items()} == before


def test_migrate_needs_the_schema_first(empty_conn):
    """On an empty database it asks for the schema instead of failing."""
    assert dbi.lambda_handler({"action": "migrate"}) == {
        "ok": False, "message": "Load the schema first (action: schema)."}
