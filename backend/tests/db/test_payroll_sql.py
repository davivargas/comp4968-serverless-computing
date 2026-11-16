import datetime

import pytest

from helpers.pg import insert
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
NINE, FIVE = datetime.time(9, 0), datetime.time(17, 0)


def day(n):
    """The date n days after the first pay period starts."""
    return ANCHOR + datetime.timedelta(days=n)


def log(conn, base, work_date, project=None, deleted=False):
    """One 9-to-5 timesheet entry for Ana."""
    insert(conn, "timesheet_entry", employee_id=base.ana,
           project_id=project or base.project, work_date=work_date,
           start_time=NINE, end_time=FIVE, is_deleted=deleted)


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


# ---- sick days, stat holidays and wages ------------------------------

def test_sick_dates_used_counts_only_live_sick_days(conn, base):
    """Only this year's sick-project days count, once per day; deleted
    entries and normal work don't."""
    log(conn, base, day(1), project=base.sick)
    log(conn, base, day(1), project=base.sick)
    log(conn, base, day(2), project=base.sick, deleted=True)
    log(conn, base, day(3))
    log(conn, base, datetime.date(2025, 12, 30), project=base.sick)
    assert payroll.sick_dates_used(conn, base.ana, 2026) == [day(1)]


def test_stat_dates_between_reads_the_holiday_table(conn):
    """Stat holidays come from the stat_holiday rows schema.sql loads."""
    found = payroll.stat_dates_between(conn, datetime.date(2026, 6, 28),
                                       datetime.date(2026, 7, 11))
    assert found == {datetime.date(2026, 7, 1)}


def test_load_wages_returns_history_per_position(conn, base):
    """A Python list works as the ANY(%s) array, and each position's
    wages come back oldest first."""
    insert(conn, "position_wage", position_id=base.dev_position,
           hourly_wage=30, effective_from=day(10), created_by=base.admin)
    wages = payroll.load_wages(conn, {base.dev_position})
    history = [(eff, str(w)) for eff, w in wages[base.dev_position]]
    assert history == [(datetime.date(2000, 1, 1), "25.00"),
                       (day(10), "30.00")]


@pytest.mark.parametrize("on, expected", [
    (day(9), "25.00"),
    (day(10), "30.00"),
])
def test_wage_join_picks_the_wage_in_effect(conn, base, on, expected):
    """WAGE_JOIN shows the wage in effect on a date, switching on the
    day a raise starts."""
    insert(conn, "position_wage", position_id=base.dev_position,
           hourly_wage=30, effective_from=day(10), created_by=base.admin)
    [row] = query(conn, f"SELECT cw.hourly_wage FROM position p {WAGE_JOIN} "
                        "WHERE p.position_id = %s",
                  (on, on, base.dev_position))
    assert str(row["hourly_wage"]) == expected


def test_wage_join_falls_back_to_the_first_future_wage(conn, base):
    """Before any wage starts, the earliest upcoming one is shown rather
    than nothing."""
    p = insert(conn, "position", title="Intern", pay_grade="G0")
    for start, wage in ((day(30), 18), (day(60), 20)):
        insert(conn, "position_wage", position_id=p["position_id"],
               hourly_wage=wage, effective_from=start, created_by=base.admin)
    [row] = query(conn, f"SELECT cw.hourly_wage FROM position p {WAGE_JOIN} "
                        "WHERE p.position_id = %s",
                  (day(0), day(0), p["position_id"]))
    assert str(row["hourly_wage"]) == "18.00"
