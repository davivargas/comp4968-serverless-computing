import datetime

from payroll_common import payroll
from payroll_common.db import query
from payroll_common.shapes import WAGE_JOIN

"""Tests for the SQL in payroll_common.payroll and shapes.WAGE_JOIN on a
real Postgres: pay periods, sick days, stat holidays and wage history.

Approach: the unit tests already check the Python around these queries
with a fake database; here the same functions run their real SQL on a
fresh copy of the schema with a few committed rows (see conftest.py).
"""

ANCHOR = datetime.date(2026, 1, 4)
def day(n):
    """The date n days after the first pay period starts."""
    return ANCHOR + datetime.timedelta(days=n)


# ---- pay periods -----------------------------------------------------

def test_ensure_periods_creates_back_to_back_periods(conn):
    """Periods run 14 days from the anchor with pay day 6 days after
    the end, and Postgres accepts them (end = start + 13)."""
    payroll.ensure_periods(conn, day(30))
    rows = query(conn, "SELECT start_date, end_date, pay_date, status "
                       "FROM pay_period ORDER BY start_date")
    assert [r["start_date"] for r in rows] == [day(0), day(14), day(28)]
    assert rows[0]["end_date"] == day(13)
    assert rows[0]["pay_date"] == day(19)
    assert {r["status"] for r in rows} == {"OPEN"}
