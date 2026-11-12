import datetime
import os
from collections import defaultdict
from fractions import Fraction
from zoneinfo import ZoneInfo

from . import rates as R
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


def vacation_rate_for(hire_date, period_end):
    return Fraction(6, 100) if (period_end - hire_date).days >= 5 * 365 + 1 else Fraction(4, 100)


def wage_for(wages, d):
    chosen = None
    for eff, w in wages:
        if eff <= d:
            chosen = w
        else:
            break
    return chosen if chosen is not None else wages[0][1]


def load_wages(conn, position_ids):
    out = defaultdict(list)
    if not position_ids:
        return out
    rows = query(conn, "SELECT position_id, effective_from, hourly_wage FROM position_wage WHERE position_id = ANY(%s) "
                       "ORDER BY position_id, effective_from", (list(position_ids),))
    for r in rows:
        out[r["position_id"]].append((r["effective_from"], r["hourly_wage"]))
    return out


def allocate_days(daily_minutes, period_start):
    out, week_first8 = {}, defaultdict(int)
    for d in sorted(daily_minutes):
        m = daily_minutes[d]
        first8 = min(m, 480)
        ot1 = min(max(m - 480, 0), 240)
        dot = max(m - 720, 0)
        w = (d - period_start).days // 7
        room = max(0, 2400 - week_first8[w])
        reg = min(first8, room)
        week_first8[w] += first8
        out[d] = (reg, ot1 + (first8 - reg), dot)
    return out


def cpp_ei(gross_c, ytd_gross_c, ytd_cpp_c, ytd_ei_c, rates):
    c, e = rates["cpp"], rates["ei"]
    before, after = ytd_gross_c, ytd_gross_c + gross_c
    ympe, yampe, mie = c["ympe"] * 100, c["yampe"] * 100, e["mie"] * 100
    band1 = max(0, min(after, ympe) - min(before, ympe))
    exempt = half_up(Fraction(c["basic_exemption"] * 100, R.PERIODS_PER_YEAR))
    cpp1 = half_up(max(0, band1 - exempt) * F(c["rate"])) if band1 > 0 else 0
    cpp1 = min(cpp1, max(0, cents(c["max1"]) - ytd_cpp_c))
    cpp2 = half_up(max(0, min(after, yampe) - max(before, ympe)) * F(c["rate2"]))
    band_ei = max(0, min(after, mie) - min(before, mie))
    ei = min(half_up(band_ei * F(e["rate"])), max(0, cents(e["max"]) - ytd_ei_c))
    return cpp1, cpp2, ei


def _bracket(a, brackets):
    chosen = brackets[0]
    for b in brackets:
        if a >= b[0]:
            chosen = b
    return F(chosen[1]), F(chosen[2])


def income_tax(gross_c, cpp1_c, cpp2_c, ei_c, rates):
    P, t = R.PERIODS_PER_YEAR, rates["tax"]
    cpp = rates["cpp"]
    i = Fraction(gross_c, 100)
    cpp1, cpp2, ei = Fraction(cpp1_c, 100), Fraction(cpp2_c, 100), Fraction(ei_c, 100)
    f5a = cpp1 * F(cpp["enhanced_rate"]) / F(cpp["rate"]) + cpp2
    a = max(ZERO, P * (i - f5a))
    credit_base = (min(P * cpp1 * F(cpp["base_rate"]) / F(cpp["rate"]), F(cpp["base_credit_max"]))
                   + min(P * ei, F(rates["ei"]["max"])))
    fed = t["federal"]
    r, k = _bracket(a, fed["brackets"])
    k2 = F(fed["lowest_rate"]) * credit_base
    k4 = min(F(fed["lowest_rate"]) * a, F(fed["lowest_rate"]) * t["cea"])
    t3 = max(ZERO, r * a - k - k2 - k4)
    bc = t["bc"]
    v, kp = _bracket(a, bc["brackets"])
    k2p = F(bc["lowest_rate"]) * credit_base
    t4 = max(ZERO, v * a - kp - k2p)
    red = bc["reduction"]
    if a <= red["start"]:
        s = min(t4, F(red["max"]))
    elif a <= red["end"]:
        s = min(t4, max(ZERO, F(red["max"]) - (a - red["start"]) * F(red["rate"])))
    else:
        s = ZERO
    t2 = max(ZERO, t4 - s)
    return half_up(t3 * 100 / P), half_up(t2 * 100 / P)


def calculate_paystub(entries, period_start, vacation_rate, ytd, rates):
    daily = defaultdict(int)
    for e in entries:
        daily[e["date"]] += e["minutes"]
    alloc = allocate_days(daily, period_start)
    rate_c = {}
    for e in entries:
        rate_c[e["date"]] = cents(e["rate"])

    tiers = defaultdict(lambda: [0, 0, 0])
    for d, (a, b, c_) in alloc.items():
        t = tiers[rate_c[d]]
        t[0] += a
        t[1] += b
        t[2] += c_
    reg_c = ot_c = dot_c = 0
    lines = []
    for rc, (rm, om, dm) in sorted(tiers.items()):
        reg_c += half_up(Fraction(rm * rc, 60))
        ot_c += half_up(Fraction(om * rc * 3, 120))
        dot_c += half_up(Fraction(dm * rc * 2, 60))
        ot_base, dot_base = half_up(Fraction(om * rc, 60)), half_up(Fraction(dm * rc, 60))
        by_project = defaultdict(int)
        for e in entries:
            if rate_c[e["date"]] == rc:
                by_project[(e["project_id"], e["project_code"])] += e["minutes"]
        target = half_up(Fraction(rm * rc, 60)) + ot_base + dot_base
        amounts = {k: half_up(Fraction(m * rc, 60)) for k, m in by_project.items()}
        biggest = max(by_project, key=lambda k: by_project[k])
        amounts[biggest] += target - sum(amounts.values())
        for (pid, pcode), m in sorted(by_project.items(), key=lambda kv: kv[0][1]):
            lines.append({"line_type": "PROJECT", "project_id": pid, "project_code": pcode,
                          "hours": dollars(half_up(Fraction(m, 60) * 100)), "rate": dollars(rc), "amount": dollars(amounts[(pid, pcode)])})
        if om:
            lines.append({"line_type": "OVERTIME_PREMIUM", "project_id": None, "project_code": None,
                          "hours": dollars(half_up(Fraction(om, 60) * 100)), "rate": dollars(half_up(Fraction(rc, 2))),
                          "amount": dollars(half_up(Fraction(om * rc * 3, 120)) - ot_base)})
        if dm:
            lines.append({"line_type": "OVERTIME_PREMIUM", "project_id": None, "project_code": None,
                          "hours": dollars(half_up(Fraction(dm, 60) * 100)), "rate": dollars(rc),
                          "amount": dollars(half_up(Fraction(dm * rc * 2, 60)) - dot_base)})
