import datetime
import json
from decimal import Decimal

import pytest

from helpers.pg import insert
from payroll_common import payroll
from payroll_common.db import one, query
from payroll_common.http_utils import HttpError
from payroll_common.release import release_period
from payroll_common.shapes import PAID_HOURS_SQL

"""Tests for payroll_common.release on a real Postgres: a finished pay
period's approved hours become paystub and earning rows.

Approach: Ana ($25/h) logs hours in committed rows, then release_period
runs every real query and INSERT. "Today" is fixed after the periods
end, so releases don't depend on the real date.
"""

FIRST = datetime.date(2026, 1, 4)
SECOND = datetime.date(2026, 1, 18)
NINE, FIVE = datetime.time(9, 0), datetime.time(17, 0)


@pytest.fixture(autouse=True)
def after_the_periods(monkeypatch):
    """Pins today (BC) to a date after every period these tests use."""
    monkeypatch.setattr(payroll, "today_bc", lambda: datetime.date(2026, 6, 1))


@pytest.fixture
def ctx(base):
    """The releasing payroll user: the IT admin from base."""
    return {"employee_id": base.admin, "name": "Ivy Test"}


def work(conn, base, d, project=None, approved=True, deleted=False):
    """One 8h entry for Ana, submitted and (by default) approved."""
    insert(conn, "timesheet_entry", employee_id=base.ana,
           project_id=project or base.project, work_date=d,
           start_time=NINE, end_time=FIVE, submitted=True, approved=approved,
           is_deleted=deleted)


def period_id(conn, start):
    """Creates the periods up to start and returns that period's id."""
    payroll.ensure_periods(conn, start)
    row = one(conn, "SELECT pay_period_id FROM pay_period WHERE start_date = %s",
              (start,))
    return row["pay_period_id"]


def stub(conn, pid):
    """Ana's paystub for one period."""
    return one(conn, "SELECT * FROM paystub WHERE pay_period_id = %s", (pid,))


def test_release_writes_paystub_lines_and_closes_period(conn, base, ctx,
                                                       audits):
    """An approved 8h day becomes a $200 paystub with the name, title
    and account digits copied in, one PROJECT line, and a closed
    period."""
    insert(conn, "direct_deposit", employee_id=base.ana, institution_no="004",
           transit_no="12345", account_no="1234567", account_last4="4567")
    work(conn, base, FIRST + datetime.timedelta(days=1))
    pid = period_id(conn, FIRST)
    result = release_period(conn, pid, ctx)
    s = stub(conn, pid)
    assert result["paystubsCreated"] == 1
    assert s["employee_name"] == "Ana Test" and s["position_title"] == "Developer"
    assert s["deposit_account_last4"] == "4567"
    assert s["regular_hours"] == Decimal("8") and s["gross_pay"] == Decimal("200")
    lines = query(conn, "SELECT line_type, project_code, hours, amount "
                        "FROM paystub_earning WHERE paystub_id = %s",
                  (s["paystub_id"],))
    assert [tuple(ln.values()) for ln in lines] == [
        ("PROJECT", 1001, Decimal("8"), Decimal("200"))]
    period = one(conn, "SELECT * FROM pay_period WHERE pay_period_id = %s", (pid,))
    assert period["status"] == "RELEASED" and period["released_by"] == base.admin
    assert period["released_at"] is not None
    assert [json.loads(m)["table"] for m in audits] == ["paystub", "pay_period"]


def test_paid_hours_sql_adds_up_a_real_paystub(conn, base, ctx):
    """PAID_HOURS_SQL runs against the paystub table and gives the hours
    actually paid."""
    work(conn, base, FIRST + datetime.timedelta(days=1))
    pid = period_id(conn, FIRST)
    release_period(conn, pid, ctx)
    row = one(conn, f"SELECT {PAID_HOURS_SQL} AS hours FROM paystub ps")
    assert row["hours"] == Decimal("8")


def test_year_to_date_adds_earlier_periods(conn, base, ctx):
    """The 2nd period's stub carries the 1st period's pay in its
    year-to-date totals."""
    work(conn, base, FIRST + datetime.timedelta(days=1))
    work(conn, base, SECOND + datetime.timedelta(days=1))
    first, second = period_id(conn, FIRST), period_id(conn, SECOND)
    release_period(conn, first, ctx)
    release_period(conn, second, ctx)
    s = stub(conn, second)
    assert s["ytd_gross"] == Decimal("400") and s["ytd_hours"] == Decimal("16")


def test_deleted_entries_neither_block_nor_pay(conn, base, ctx):
    """A deleted unapproved entry doesn't block release, and a deleted
    approved one isn't paid."""
    work(conn, base, FIRST + datetime.timedelta(days=1))
    work(conn, base, FIRST + datetime.timedelta(days=2), approved=False,
         deleted=True)
    work(conn, base, FIRST + datetime.timedelta(days=3), deleted=True)
    pid = period_id(conn, FIRST)
    release_period(conn, pid, ctx)
    assert stub(conn, pid)["regular_hours"] == Decimal("8")


def test_unapproved_entry_blocks_release(conn, base, ctx):
    """One live unapproved entry stops the release with a 409, and no
    paystub is written."""
    work(conn, base, FIRST + datetime.timedelta(days=1), approved=False)
    pid = period_id(conn, FIRST)
    with pytest.raises(HttpError) as err:
        release_period(conn, pid, ctx)
    assert err.value.status == 409 and "1 timesheet entry" in err.value.message
    assert one(conn, "SELECT count(*)::int AS n FROM paystub")["n"] == 0
