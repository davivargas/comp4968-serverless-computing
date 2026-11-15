import datetime
import re
from decimal import Decimal

import pytest

from helpers.fakes import FakeDB
from payroll_common import payroll, release
from payroll_common.http_utils import HttpError

"""Unit tests for payroll_common.release, which turns a finished pay
period's approved timesheets into paystubs and marks it RELEASED.

Approach: FakeDB answers the SQL release_period runs (including the wage
and stat-holiday lookups in payroll) for one employee working one 8h day
at $25, so the paystub numbers stay easy to check. audit() is recorded.
"""

START = datetime.date(2026, 1, 4)
END = datetime.date(2026, 1, 17)
DAY_AFTER = END + datetime.timedelta(days=1)
PERIOD_SQL = "SELECT * FROM pay_period WHERE pay_period_id"
PERIOD = {"pay_period_id": 1, "start_date": START, "end_date": END,
          "pay_date": datetime.date(2026, 1, 23), "status": "OPEN"}
MEI = {"employee_id": 7, "name": "Mei Ross",
       "hire_date": datetime.date(2025, 6, 1), "position_id": 3,
       "title": "Developer", "account_last4": "6789"}
WAGE = {"position_id": 3, "effective_from": datetime.date(2026, 1, 1),
        "hourly_wage": Decimal("25.00")}
DAY = {"employee_id": 7, "work_date": datetime.date(2026, 1, 5),
       "project_id": 1, "project_code": 1001, "special_type": None,
       "minutes": 480}
YTD = {"employee_id": 7, "hours": Decimal("80"), "gross": Decimal("2000.00"),
       "cpp": Decimal("110.99"), "ei": Decimal("32.60"),
       "federal": Decimal("251.82"), "provincial": Decimal("95.09"),
       "net": Decimal("1509.50")}
CTX = {"employee_id": 99, "name": "Pat Admin"}


@pytest.fixture(autouse=True)
def db(monkeypatch):
    """One open, finished period with one approved 8h day for Mei at
    $25/h; today (BC) is the day after the period ends."""
    fake = FakeDB()
    fake.on(PERIOD_SQL, PERIOD)
    fake.on("AS n FROM timesheet_entry", {"n": 0})
    fake.on("LEFT JOIN direct_deposit", [MEI])
    fake.on("FROM position_wage", [WAGE])
    fake.on("GROUP BY t.employee_id", [DAY])
    fake.on("INSERT INTO paystub (", {"paystub_id": 50})
    for module in (release, payroll):
        monkeypatch.setattr(module, "query", fake.query)
    monkeypatch.setattr(release, "one", fake.one)
    monkeypatch.setattr(payroll, "today_bc", lambda: DAY_AFTER)
    return fake


@pytest.fixture(autouse=True)
def audits(monkeypatch):
    """Collects (table, record id, action) for every audit() call."""
    log = []

    def record(conn, ctx, table, record_id, action, old, new):
        log.append((table, record_id, action))

    monkeypatch.setattr(release, "audit", record)
    return log


def inserted_stub(db):
    """The paystub INSERT as a {column: value} dict."""
    [(sql, params)] = db.ran("INSERT INTO paystub (")
    cols = re.search(r"INSERT INTO paystub \(([^)]*)\)", sql).group(1)
    return dict(zip(cols.split(", "), params))


def refused(db, status, text):
    """Runs a release that must fail, and checks nothing was written."""
    with pytest.raises(HttpError) as err:
        release.release_period("conn", 1, CTX)
    assert err.value.status == status and text in err.value.message
    assert db.ran("INSERT INTO") == []
    assert db.ran("UPDATE pay_period SET") == []
    return err.value


# ---- successful release ----------------------------------------------

def test_release_writes_paystub_and_closes_period(db):
    """One paystub per employee with name, title and the last 4 of the
    deposit account; then the period is RELEASED by the releaser."""
    result = release.release_period("conn", 1, CTX)
    stub = inserted_stub(db)
    assert stub["employee_id"] == 7 and stub["pay_period_id"] == 1
    assert stub["employee_name"] == "Mei Ross"
    assert stub["position_title"] == "Developer"
    assert stub["deposit_account_last4"] == "6789"
    assert stub["regular_hours"] == 8.0 and stub["gross_pay"] == 200.0
    assert db.params("UPDATE pay_period SET status = 'RELEASED'") == [(99, 1)]
    assert result["paystubsCreated"] == 1 and result["status"] == "RELEASED"
    assert result["paystubs"] == [{"paystubId": 50, "employeeId": 7,
                                   "gross": 200.0, "net": stub["net_pay"]}]


def test_release_writes_earning_lines_for_the_stub(db):
    """Each earnings line is stored against the new paystub's id."""
    release.release_period("conn", 1, CTX)
    lines = db.params("INSERT INTO paystub_earning")
    assert [(ln[0], ln[1], ln[3]) for ln in lines] == [(50, "PROJECT", 1001)]
    assert lines[0][4:] == (8.0, 25.0, 200.0)


def test_release_locks_the_period_row(db):
    """The period is read FOR UPDATE, so two admins releasing at once
    can't both create paystubs."""
    release.release_period("conn", 1, CTX)
    [(sql, params)] = db.ran(PERIOD_SQL)
    assert sql.endswith("FOR UPDATE") and params == (1,)


@pytest.mark.parametrize("write_audit, expected", [
    (True, [("paystub", 50, "INSERT"), ("pay_period", 1, "UPDATE")]),
    (False, []),
])
def test_release_audit_can_be_switched_off(audits, write_audit, expected):
    """Normal releases audit each paystub and the period change; bulk
    demo loads switch auditing off."""
    release.release_period("conn", 1, CTX, write_audit=write_audit)
    assert audits == expected


def test_release_adds_year_to_date_from_earlier_periods(db):
    """YTD only counts earlier periods paid in the same year, and this
    stub's amounts are added on top."""
    db.on("FROM paystub ps JOIN pay_period pp", [YTD])
    release.release_period("conn", 1, CTX)
    assert db.params("FROM paystub ps JOIN pay_period pp") == [(START, 2026)]
    stub = inserted_stub(db)
    assert stub["ytd_gross"] == 2200.0 and stub["ytd_hours"] == 88.0


# ---- refusals --------------------------------------------------------

def test_unknown_period_is_404(db):
    """Releasing a period id that doesn't exist is a 404."""
    db.on(PERIOD_SQL, None)
    refused(db, 404, "Pay period not found")


def test_released_period_cannot_be_released_again(db):
    """A second release would duplicate every paystub, so it's a 409."""
    db.on(PERIOD_SQL, {**PERIOD, "status": "RELEASED"})
    refused(db, 409, "already been released")


@pytest.mark.parametrize("today", [END, END - datetime.timedelta(days=3)])
def test_period_must_be_over(db, monkeypatch, today):
    """A period can't be released on or before its last day (BC date),
    since hours could still be logged."""
    monkeypatch.setattr(payroll, "today_bc", lambda: today)
    refused(db, 409, "has not ended yet")


@pytest.mark.parametrize("count, text", [
    (1, "1 timesheet entry is not approved yet"),
    (3, "3 timesheet entries are not approved yet"),
])
def test_unapproved_entries_block_release(db, count, text):
    """Every entry must be approved first; the error gives the count in
    proper English and unapprovedCount for the UI."""
    db.on("AS n FROM timesheet_entry", {"n": count})
    error = refused(db, 409, text)
    assert error.details == {"unapprovedCount": count}


def test_period_without_entries_is_409(db):
    """An empty period has nothing to pay, so it isn't released."""
    db.on("LEFT JOIN direct_deposit", [])
    refused(db, 409, "nothing to release")


def test_position_without_wage_is_409(db):
    """If a position has no wage on record, release stops and names it
    instead of paying $0."""
    db.on("FROM position_wage", [])
    refused(db, 409, '"Developer" has no wage set')
