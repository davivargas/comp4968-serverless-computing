from payroll_common.db import one, query

"""Tests for backend/db/schema.sql and seed.sql on a real Postgres.

Approach: each test gets a fresh copy of the schema (see conftest.py).
Rows that break a rule must be refused by Postgres itself, so the
database stays consistent even if a Lambda forgets a check.
"""

TABLES = {"role", "position", "team", "employee", "position_wage",
          "direct_deposit", "project", "project_assignment",
          "timesheet_entry", "stat_holiday", "pay_period", "paystub",
          "paystub_earning"}
def test_schema_creates_every_table(conn):
    """schema.sql builds all 13 tables in the public schema."""
    rows = query(conn, "SELECT table_name FROM information_schema.tables "
                       "WHERE table_schema = 'public'")
    assert {r["table_name"] for r in rows} == TABLES
