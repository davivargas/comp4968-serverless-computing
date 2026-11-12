import datetime
import os
from fractions import Fraction
from zoneinfo import ZoneInfo


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
