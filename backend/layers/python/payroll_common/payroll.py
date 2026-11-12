import datetime
import os
from fractions import Fraction
from zoneinfo import ZoneInfo

from .db import one, query
from .http_utils import HttpError


ZERO = Fraction(0)


def cfg():
    return {
        "anchor": datetime.date.fromisoformat(os.environ.get("PAY_PERIOD_ANCHOR", "2026-01-04")),
        "lag": int(os.environ.get("PAY_DATE_LAG_DAYS", 5)),
    }


def today_bc():
    return datetime.datetime.now(ZoneInfo("America/Vancouver")).date()


def F(x):
    return Fraction(str(x))


def half_up(fr):
    fr = Fraction(fr)
    n = (abs(fr.numerator) * 2 + fr.denominator) // (2 * fr.denominator)
    return n if fr >= 0 else -n


def cents(v):
    return half_up(F(v) * 100)


def dollars(c):
    return c / 100


def ensure_periods(conn, through_date):
    c = cfg()
    if through_date < c["anchor"]:
        return
    query(conn, """INSERT INTO pay_period (start_date, end_date, pay_date)
                   SELECT (%s::date + n * 14), (%s::date + n * 14 + 13), (%s::date + n * 14 + 13 + %s::int)
                     FROM generate_series(0, (%s::date - %s::date) / 14) AS n
                   ON CONFLICT (start_date) DO NOTHING""",
          (c["anchor"], c["anchor"], c["anchor"], c["lag"], through_date, c["anchor"]))


def period_containing(conn, d):
    ensure_periods(conn, d)
    return one(conn, "SELECT * FROM pay_period WHERE %s::date BETWEEN start_date AND end_date", (d,))


def assert_date_editable(conn, d):
    p = period_containing(conn, d)
    if p is None:
        raise HttpError(409, "That date is before the first pay period")
    if p["status"] == "RELEASED":
        raise HttpError(409, "That pay period has already been released; timesheets are locked")
    return p
