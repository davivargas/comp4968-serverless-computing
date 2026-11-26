import datetime
from decimal import Decimal
from fractions import Fraction

import pytest

from helpers.fakes import FakeDB
from payroll_common import payroll
from payroll_common.http_utils import HttpError
from payroll_common.payroll import (
    allocate_days, assert_date_editable, calculate_paystub, cents, cfg, cpp_ei,
    deductions_json, dollars, half_up, income_tax, load_wages, mask,
    rates_for, sick_days_per_year, vacation_rate_for, wage_for,
)

"""Unit tests for payroll_common.payroll, the pay calculations used when
a pay period is released: overtime, premiums, vacation, CPP, EI and tax.

Approach: pure functions with small inputs whose results were worked out
by hand, in integer cents like the module itself. Paystub tests also
check rules that hold for any input: the earnings lines add up to gross,
and net pay is gross minus deductions. The pay-period lookups that run
SQL use helpers.fakes.FakeDB.
"""

RATES = rates_for(2026)
START = datetime.date(2026, 1, 4)  # a Sunday, the first pay period
MON = datetime.date(2026, 1, 5)
TUE = datetime.date(2026, 1, 6)
SAT = datetime.date(2026, 1, 10)
NEXT_MON = datetime.date(2026, 1, 12)
YTD_FIELDS = ("hours", "gross", "cpp", "ei", "federal", "provincial", "net")
ZERO_YTD = dict.fromkeys(YTD_FIELDS, 0)
DEDUCTIONS = ("cpp", "ei", "federal_tax", "provincial_tax")


def entry(day, minutes, kind="WORK", rate="25.00", project=(1, "P1")):
    return {"date": day, "minutes": minutes, "kind": kind,
            "rate": Decimal(rate), "project_id": project[0],
            "project_code": project[1]}


def stub(entries, vacation_rate=0, stat_dates=(), ytd=ZERO_YTD):
    return calculate_paystub(entries, START, Fraction(vacation_rate), ytd,
                             RATES, stat_dates)


def in_cents(x):
    return round(x * 100)


# ---- rounding and money ----------------------------------------------

@pytest.mark.parametrize("value, expected", [
    (Fraction(5, 2), 3),
    (Fraction(7, 2), 4),
    (Fraction(-5, 2), -3),
    (Fraction(249, 100), 2),
    (Fraction(251, 100), 3),
])
def test_half_up_rounds_halves_away_from_zero(value, expected):
    """Unlike Python's round(), which sends 2.5 to 2, halves always
    round away from zero."""
    assert half_up(value) == expected


def test_cents_avoids_float_error():
    """1.005 * 100 is 100.4999... as a float; cents() goes through str()
    and Fraction, so it correctly rounds to 101."""
    assert cents(1.005) == 101
    assert cents("12.345") == 1235
    assert cents(Decimal("25.00")) == 2500
    assert dollars(1235) == 12.35


# ---- vacation and wages ----------------------------------------------

HIRED = datetime.date(2021, 1, 1)
WAGES = [(datetime.date(2026, 1, 1), 20), (datetime.date(2026, 6, 1), 25)]


@pytest.mark.parametrize("period_end, expected", [
    (datetime.date(2022, 1, 1), Fraction(0)),
    (datetime.date(2022, 1, 2), Fraction(4, 100)),
    (datetime.date(2025, 12, 31), Fraction(4, 100)),
    (datetime.date(2026, 1, 1), Fraction(6, 100)),
])
def test_vacation_rate_steps(period_end, expected):
    """No vacation pay in the first year, 4% after it, and 6% from day
    1826 (5 years for this hire date)."""
    assert vacation_rate_for(HIRED, period_end) == expected


@pytest.mark.parametrize("day, expected", [
    (datetime.date(2025, 12, 1), 20),
    (datetime.date(2026, 5, 31), 20),
    (datetime.date(2026, 6, 1), 25),
    (datetime.date(2027, 1, 1), 25),
])
def test_wage_for_picks_wage_in_effect(day, expected):
    """A raise applies from its effective date on; work before the first
    wage record falls back to the earliest wage."""
    assert wage_for(WAGES, day) == expected


def test_load_wages_skips_db_for_no_positions():
    """With no positions to look up no query runs at all (conn=None
    would crash if one did)."""
    assert load_wages(None, set()) == {}


# ---- overtime allocation ---------------------------------------------

@pytest.mark.parametrize("minutes, expected", [
    (480, (480, 0, 0)),
    (600, (480, 120, 0)),
    (720, (480, 240, 0)),
    (780, (480, 240, 60)),
])
def test_allocate_days_daily_overtime(minutes, expected):
    """The first 8h of a day are regular, 8-12h are time-and-a-half and
    anything past 12h is double time."""
    assert allocate_days({MON: minutes}, START)[MON] == expected


def test_allocate_days_weekly_overtime():
    """Once 40 regular hours are used in a week, the rest of that week's
    first-8h time becomes time-and-a-half."""
    days = [START + datetime.timedelta(days=i) for i in range(6)]
    out = allocate_days(dict.fromkeys(days, 480), START)
    assert [out[d] for d in days] == [(480, 0, 0)] * 5 + [(0, 480, 0)]


def test_allocate_days_weekly_cap_resets_each_week():
    """The 40-hour count starts over in the second week of the period."""
    week1 = [START + datetime.timedelta(days=i) for i in range(6)]
    week2 = datetime.date(2026, 1, 11)
    out = allocate_days({**dict.fromkeys(week1, 480), week2: 480}, START)
    assert out[week2] == (480, 0, 0)


# ---- CPP, EI and income tax ------------------------------------------

def test_cpp_ei_for_a_normal_period():
    """$2,000 gross, nothing earned yet this year. CPP: (2000 - 134.62
    exemption) x 5.95% = 110.99. EI: 2000 x 1.63% = 32.60."""
    assert cpp_ei(200_000, 0, 0, 0, RATES) == (11_099, 0, 3_260)


def test_cpp_ei_stop_at_annual_maximums():
    """Once the year's CPP or EI maximum is deducted nothing more is
    taken, and a nearly-full year only takes what's left."""
    max_cpp, max_ei = cents(RATES["cpp"]["max1"]), cents(RATES["ei"]["max"])
    assert cpp_ei(200_000, 0, max_cpp, max_ei, RATES) == (0, 0, 0)
    assert cpp_ei(200_000, 0, max_cpp - 5_000, 0, RATES)[0] == 5_000


def test_cpp2_applies_above_ympe():
    """Above the YMPE ($74,600) base CPP stops and only the 4% CPP2 is
    taken; that's also past the EI maximum ($68,900)."""
    ympe = RATES["cpp"]["ympe"] * 100
    assert cpp_ei(200_000, ympe, 0, 0, RATES) == (0, 8_000, 0)


def test_income_tax_for_a_normal_period():
    """$2,000 biweekly (~$51,515/yr): federal 14% minus basic credits,
    BC in its 7.7% bracket. Expected values worked out by hand."""
    assert income_tax(200_000, 11_099, 0, 3_260, RATES) == (25_182, 9_509)


def test_low_income_pays_no_tax():
    """Tax credits cancel tax on very small pay; the result is 0, never
    a negative amount on the paystub."""
    cpp1, cpp2, ei = cpp_ei(5_000, 0, 0, 0, RATES)
    assert income_tax(5_000, cpp1, cpp2, ei, RATES) == (0, 0)


def test_bc_tax_reduction_for_lower_incomes():
    """At ~$10,400 a year the BC tax reduction cancels all provincial
    tax, while federal tax is still owed."""
    cpp1, cpp2, ei = cpp_ei(40_000, 0, 0, 0, RATES)
    fed, prov = income_tax(40_000, cpp1, cpp2, ei, RATES)
    assert fed > 0 and prov == 0


def test_rates_for_unknown_year_is_a_clear_500():
    """Releasing payroll in a year with no configured rates stops with
    a message naming the year, instead of using old rates."""
    with pytest.raises(HttpError, match="2027") as err:
        rates_for(2027)
    assert err.value.status == 500


# ---- calculate_paystub -----------------------------------------------

def test_paystub_plain_day():
    """8h on a Monday at $25: $200 regular pay, one project line, and
    CPP/EI of $3.89 / $3.26 from the same formulas as above."""
    s = stub([entry(MON, 480)])
    assert s["regular_hours"] == 8.0 and s["regular_pay"] == 200.0
    assert s["gross_pay"] == 200.0
    assert s["cpp"] == 3.89 and s["ei"] == 3.26
    assert [ln["line_type"] for ln in s["earnings"]] == ["PROJECT"]


def test_paystub_overtime_split():
    """10h day = 8h + 2h at 1.5x = $275. The project line holds straight
    time ($250); the premium line holds only the extra $25."""
    s = stub([entry(MON, 600)])
    assert s["regular_pay"] == 200.0 and s["overtime_pay"] == 75.0
    assert s["overtime_hours"] == 2.0 and s["gross_pay"] == 275.0
    lines = {ln["line_type"]: ln for ln in s["earnings"]}
    assert lines["PROJECT"]["amount"] == 250.0
    assert lines["OVERTIME_PREMIUM"]["amount"] == 25.0
    assert lines["OVERTIME_PREMIUM"]["rate"] == 12.5


def test_paystub_weekend_premium():
    """Saturday work is paid at 1.5x from the first hour and is kept out
    of the weekday overtime count."""
    s = stub([entry(SAT, 480)])
    assert s["weekend_hours"] == 8.0 and s["weekend_pay"] == 300.0
    assert s["regular_hours"] == 0 and s["overtime_hours"] == 0


def test_paystub_weekend_double_time_past_12h():
    """Weekend hours past 12 in one day move up to double time."""
    s = stub([entry(SAT, 780)])
    assert s["weekend_hours"] == 12.0 and s["weekend_pay"] == 450.0
    assert s["double_overtime_hours"] == 1.0
    assert s["double_overtime_pay"] == 50.0


def test_paystub_stat_holiday_premium():
    """Work on a stat holiday is paid at 1.5x even on a weekday."""
    s = stub([entry(MON, 480)], stat_dates={MON})
    assert s["stat_hours"] == 8.0 and s["stat_pay"] == 300.0
    assert s["regular_hours"] == 0


def test_paystub_sick_time_is_straight_and_never_overtime():
    """Sick hours are paid at the base rate and don't count toward the
    8h day, so 8h work + 4h sick has no overtime."""
    s = stub([entry(MON, 480), entry(MON, 240, kind="SICK", project=(9, "SICK"))])
    assert s["overtime_hours"] == 0
    assert s["sick_hours"] == 4.0 and s["sick_pay"] == 100.0
    assert s["gross_pay"] == 300.0


def test_paystub_sick_only_period_has_no_project_lines():
    """A period with only sick time pays it on one SICK line and adds
    no empty PROJECT lines."""
    s = stub([entry(MON, 480, kind="SICK", project=(9, "SICK"))])
    assert [ln["line_type"] for ln in s["earnings"]] == ["SICK"]
    assert s["earnings"][0]["amount"] == 200.0
    assert s["gross_pay"] == 200.0


def test_paystub_vacation_pay_and_leave():
    """4% vacation pay is added on top of earned pay; vacation leave
    hours are reported but not paid as extra hours."""
    s = stub([entry(MON, 480), entry(TUE, 480, kind="VAC")],
             vacation_rate=Fraction(4, 100))
    assert s["vacation_pay"] == 8.0 and s["gross_pay"] == 208.0
    assert s["vacation_leave_hours"] == 8.0


def test_paystub_uses_latest_hourly_rate():
    """When a raise lands mid-period each day is paid at its own rate,
    and the stub shows the newest rate."""
    s = stub([entry(MON, 480, rate="25.00"), entry(NEXT_MON, 480, rate="30.00")])
    assert s["regular_pay"] == 440.0
    assert s["hourly_rate"] == 30.0


def test_paystub_adds_to_year_to_date():
    """YTD fields are the earlier totals plus this stub's amounts."""
    ytd = {**ZERO_YTD, "hours": 80, "gross": Decimal("2000.00")}
    s = stub([entry(MON, 480)], ytd=ytd)
    assert s["ytd_hours"] == 88.0 and s["ytd_gross"] == 2200.0


MIXED = [
    entry(MON, 300, project=(1, "P1")),
    entry(MON, 330, project=(2, "P2")),
    entry(TUE, 800, rate="25.37"),
    entry(SAT, 410, project=(2, "P2")),
    entry(NEXT_MON, 480, rate="26.10"),
    entry(datetime.date(2026, 1, 13), 240, kind="SICK", project=(9, "SICK")),
]


@pytest.mark.parametrize("vacation_rate", [0, Fraction(4, 100), Fraction(6, 100)])
def test_paystub_totals_always_add_up(vacation_rate):
    """For a messy period (split projects, odd-cent rates, OT, weekend,
    stat, sick) lines sum to gross and net = gross - deductions."""
    s = stub(MIXED, vacation_rate=vacation_rate, stat_dates={NEXT_MON})
    lines = sum(in_cents(ln["amount"]) for ln in s["earnings"])
    assert lines == in_cents(s["gross_pay"])
    deductions = sum(in_cents(s[k]) for k in DEDUCTIONS)
    assert deductions == in_cents(s["total_deductions"])
    assert in_cents(s["net_pay"]) == in_cents(s["gross_pay"]) - deductions


# ---- timesheet locking -----------------------------------------------

@pytest.fixture
def period(monkeypatch):
    """Fakes period_containing so the locking rules run without
    Postgres; set period["value"] to the period row."""
    holder = {"value": None}

    def fake_period_containing(conn, d):
        return holder["value"]

    monkeypatch.setattr(payroll, "period_containing", fake_period_containing)
    return holder


def test_date_before_first_period_is_locked(period):
    """Dates before the first pay period can't be edited at all."""
    with pytest.raises(HttpError, match="before the first pay period") as err:
        assert_date_editable(None, MON)
    assert err.value.status == 409


def test_released_period_is_locked(period):
    """Once a period is released its paystubs exist, so its timesheets
    must not change anymore."""
    period["value"] = {"status": "RELEASED"}
    with pytest.raises(HttpError, match="already been released"):
        assert_date_editable(None, MON)


def test_open_period_is_editable(period):
    """An open period is returned so callers can use its dates."""
    period["value"] = {"status": "OPEN", "pay_period_id": 1}
    assert assert_date_editable(None, MON)["pay_period_id"] == 1


# ---- small helpers ---------------------------------------------------

def test_mask_shows_only_last_four_digits():
    """Bank accounts show as ****1234; a missing account stays null."""
    assert mask("1234") == "****1234"
    assert mask(None) is None and mask("") is None


def test_deductions_json_reads_prefixed_columns():
    """One helper builds both this-period and ytd_ deduction blocks."""
    row = {"ytd_federal_tax": 1, "ytd_provincial_tax": 2,
           "ytd_cpp": 3, "ytd_ei": 4}
    assert deductions_json(row, "ytd_") == {
        "federalTax": 1, "provincialTax": 2, "cpp": 3, "ei": 4,
    }


def test_config_defaults_and_env_overrides(monkeypatch):
    """Pay periods start 2026-01-04 with pay 6 days after the end, and
    sick days default to 5, unless env vars override them."""
    for var in ("PAY_PERIOD_ANCHOR", "PAY_DATE_LAG_DAYS", "SICK_DAYS_PER_YEAR"):
        monkeypatch.delenv(var, raising=False)
    assert cfg() == {"anchor": datetime.date(2026, 1, 4), "lag": 6}
    assert sick_days_per_year() == 5
    monkeypatch.setenv("PAY_DATE_LAG_DAYS", "3")
    monkeypatch.setenv("SICK_DAYS_PER_YEAR", "8")
    assert cfg()["lag"] == 3 and sick_days_per_year() == 8


# ---- pay-period lookups (SQL) ----------------------------------------

@pytest.fixture
def fake_db(monkeypatch):
    """FakeDB behind payroll.query/one, with the default pay settings."""
    fake = FakeDB()
    monkeypatch.setattr(payroll, "query", fake.query)
    monkeypatch.setattr(payroll, "one", fake.one)
    monkeypatch.delenv("PAY_PERIOD_ANCHOR", raising=False)
    monkeypatch.delenv("PAY_DATE_LAG_DAYS", raising=False)
    return fake


def test_ensure_periods_ignores_dates_before_the_anchor(fake_db):
    """Nothing is created for dates before the first pay period."""
    payroll.ensure_periods(None, datetime.date(2026, 1, 3))
    assert fake_db.calls == []


def test_ensure_periods_fills_in_missing_periods(fake_db):
    """All 14-day periods from the anchor up to the date are created in
    one statement; ON CONFLICT makes re-running harmless."""
    payroll.ensure_periods(None, datetime.date(2026, 3, 1))
    [(sql, params)] = fake_db.ran("INSERT INTO pay_period")
    assert "ON CONFLICT (start_date) DO NOTHING" in sql
    assert params == (START, START, START, 6, datetime.date(2026, 3, 1), START)


def test_period_containing_creates_then_finds(fake_db):
    """Looking up a date's period first makes sure that period exists."""
    fake_db.on("BETWEEN start_date AND end_date", {"pay_period_id": 3})
    assert payroll.period_containing(None, MON) == {"pay_period_id": 3}
    statements = [sql for sql, _ in fake_db.calls]
    assert len(statements) == 2
    assert statements[0].startswith("INSERT INTO pay_period")
    assert fake_db.params("BETWEEN start_date AND end_date") == [(MON,)]


def test_sick_dates_cover_one_calendar_year(fake_db):
    """Sick days are counted per calendar year (Jan 1 to Dec 31) for one
    employee, from SICK projects only."""
    fake_db.on("special_type = 'SICK'", [{"work_date": MON}, {"work_date": TUE}])
    assert payroll.sick_dates_used(None, 7, 2026) == [MON, TUE]
    expected = (7, datetime.date(2026, 1, 1), datetime.date(2026, 12, 31))
    assert fake_db.params("special_type = 'SICK'") == [expected]


def test_stat_dates_between_returns_a_set(fake_db):
    """Stat holidays come back as a set of dates for quick lookups."""
    fake_db.on("FROM stat_holiday", [{"holiday_date": MON}])
    assert payroll.stat_dates_between(None, START, NEXT_MON) == {MON}
    assert fake_db.params("FROM stat_holiday") == [(START, NEXT_MON)]


def test_load_wages_groups_history_by_position(fake_db):
    """Wage history comes back per position, oldest first, the shape
    wage_for() expects."""
    jan, jun = datetime.date(2026, 1, 1), datetime.date(2026, 6, 1)
    fake_db.on("FROM position_wage", [
        {"position_id": 3, "effective_from": jan, "hourly_wage": 20},
        {"position_id": 3, "effective_from": jun, "hourly_wage": 25},
        {"position_id": 4, "effective_from": jan, "hourly_wage": 30},
    ])
    wages = load_wages(None, {3, 4})
    assert wages[3] == [(jan, 20), (jun, 25)] and wages[4] == [(jan, 30)]
    [(ids,)] = fake_db.params("FROM position_wage")
    assert sorted(ids) == [3, 4]


def frozen_now(monkeypatch, *moment):
    """Freezes datetime.now() at the given UTC moment."""
    class FrozenDatetime(datetime.datetime):
        @classmethod
        def now(cls, tz=None):
            utc = datetime.timezone.utc
            return datetime.datetime(*moment, tzinfo=utc).astimezone(tz)

    monkeypatch.setattr(payroll.datetime, "datetime", FrozenDatetime)


def test_today_bc_uses_the_vancouver_date(monkeypatch):
    """Cut-offs use BC's date, not UTC: at 06:30 UTC on Jan 1 it is
    still Dec 31 in BC (UTC-7)."""
    frozen_now(monkeypatch, 2026, 1, 1, 6, 30)
    assert payroll.today_bc() == datetime.date(2025, 12, 31)
    frozen_now(monkeypatch, 2026, 1, 1, 7, 30)
    assert payroll.today_bc() == datetime.date(2026, 1, 1)


def test_bc_offset_is_fixed_all_year():
    """BC no longer changes its clocks: winter and summer are both
    UTC-7, whatever time zone database the runtime has."""
    for month in (1, 7, 11):
        moment = datetime.datetime(2026, month, 15, 12, tzinfo=payroll.BC_TZ)
        assert moment.utcoffset() == datetime.timedelta(hours=-7)
