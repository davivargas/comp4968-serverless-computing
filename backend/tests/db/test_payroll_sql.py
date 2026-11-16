import datetime

import pytest

from payroll_common import payroll
from payroll_common.db import query
from payroll_common.http_utils import HttpError
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


def test_ensure_periods_is_safe_to_repeat(conn):
    """Running it again (every Lambda call does) adds only the missing
    periods; ON CONFLICT skips the existing ones."""
    payroll.ensure_periods(conn, day(20))
    payroll.ensure_periods(conn, day(40))
    rows = query(conn, "SELECT start_date FROM pay_period")
    assert sorted(r["start_date"] for r in rows) == [day(0), day(14), day(28)]


def test_period_containing_finds_the_right_period(conn):
    """A date in the middle of the 2nd period returns that period, and a
    date before the anchor has none."""
    period = payroll.period_containing(conn, day(20))
    assert period["start_date"] == day(14)
    assert payroll.period_containing(conn, day(-1)) is None


def test_released_period_locks_its_dates(conn):
    """Once a period is RELEASED, its dates can't be edited any more."""
    payroll.ensure_periods(conn, day(0))
    query(conn, "UPDATE pay_period SET status = 'RELEASED'")
    with pytest.raises(HttpError) as err:
        payroll.assert_date_editable(conn, day(3))
    assert err.value.status == 409
