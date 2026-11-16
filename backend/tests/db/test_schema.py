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


def test_schema_seeds_roles_and_stat_holidays(conn):
    """Role ids are fixed (1 manager, 2 payroll admin, 3 IT) because the
    code refers to them by number; 2026 has BC's 11 stat holidays."""
    roles = query(conn, "SELECT role_id, name FROM role ORDER BY role_id")
    assert [(r["role_id"], r["name"]) for r in roles] == [
        (1, "MANAGER"), (2, "PAYROLL_ADMIN"), (3, "IT")]
    n = one(conn, "SELECT count(*)::int AS n FROM stat_holiday "
                  "WHERE extract(year FROM holiday_date) = 2026")["n"]
    assert n == 11
