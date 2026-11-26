import datetime
import os
from collections import defaultdict
from fractions import Fraction

from dateutil.relativedelta import relativedelta

from . import rates as R
from .db import one, query
from .http_utils import HttpError

ZERO = Fraction(0)

# British Columbia stays on UTC-7 all year since 2026-11-01. A fixed offset (not the "America/Vancouver" name)
# gives the same answer even if the runtime's time zone database is older than that change.
BC_TZ = datetime.timezone(datetime.timedelta(hours=-7), "PT")


def cfg():
    return {
        "anchor": datetime.date.fromisoformat(os.environ.get("PAY_PERIOD_ANCHOR", "2026-01-04")),
        "lag": int(os.environ.get("PAY_DATE_LAG_DAYS", 6)),
    }


def today_bc():
    return datetime.datetime.now(BC_TZ).date()


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
    if period_end <= hire_date + relativedelta(years=1):
        return ZERO
    return Fraction(6, 100) if (period_end - hire_date).days >= 5 * 365 + 1 else Fraction(4, 100)


def sick_days_per_year():
    return int(os.environ.get("SICK_DAYS_PER_YEAR", 5))


def sick_dates_used(conn, emp_id, year):
    rows = query(conn, """SELECT DISTINCT t.work_date FROM timesheet_entry t JOIN project p ON p.project_id = t.project_id
                           WHERE t.employee_id = %s AND NOT t.is_deleted AND p.special_type = 'SICK'
                             AND t.work_date BETWEEN %s AND %s ORDER BY t.work_date""",
                 (emp_id, datetime.date(year, 1, 1), datetime.date(year, 12, 31)))
    return [r["work_date"] for r in rows]


def stat_dates_between(conn, start, end):
    rows = query(conn, "SELECT holiday_date FROM stat_holiday WHERE holiday_date BETWEEN %s AND %s", (start, end))
    return {r["holiday_date"] for r in rows}


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


def calculate_paystub(entries, period_start, vacation_rate, ytd, rates, stat_dates=()):
    stat_dates = set(stat_dates)
    work = [e for e in entries if e.get("kind", "WORK") == "WORK"]
    sick = [e for e in entries if e.get("kind") == "SICK"]
    vac = [e for e in entries if e.get("kind") == "VAC"]
    rate_c = {e["date"]: cents(e["rate"]) for e in entries}

    daily = defaultdict(int)
    for e in work:
        daily[e["date"]] += e["minutes"]
    premium = {d for d in daily if d.weekday() >= 5 or d in stat_dates}
    alloc = allocate_days({d: m for d, m in daily.items() if d not in premium}, period_start)

    tiers = defaultdict(lambda: [0, 0, 0, 0, 0])
    for d, (a, b, c_) in alloc.items():
        t = tiers[rate_c[d]]
        t[0] += a
        t[1] += b
        t[2] += c_
    for d in premium:
        m = daily[d]
        t = tiers[rate_c[d]]
        t[4 if d in stat_dates else 3] += min(m, 720)
        t[2] += max(m - 720, 0)
    sick_min = defaultdict(int)
    for e in sick:
        sick_min[rate_c[e["date"]]] += e["minutes"]
    vac_min = sum(e["minutes"] for e in vac)

    hrs = lambda m: dollars(half_up(Fraction(m, 60) * 100))
    reg_c = ot_c = dot_c = wk_c = st_c = sick_c = 0
    lines = []
    for rc in sorted(set(tiers) | set(sick_min)):
        rm, om, dm, wm, sm = tiers[rc] if rc in tiers else (0, 0, 0, 0, 0)
        reg_c += half_up(Fraction(rm * rc, 60))
        ot_c += half_up(Fraction(om * rc * 3, 120))
        dot_c += half_up(Fraction(dm * rc * 2, 60))
        wk_c += half_up(Fraction(wm * rc * 3, 120))
        st_c += half_up(Fraction(sm * rc * 3, 120))
        ot_base, dot_base = half_up(Fraction(om * rc, 60)), half_up(Fraction(dm * rc, 60))
        wk_base, st_base = half_up(Fraction(wm * rc, 60)), half_up(Fraction(sm * rc, 60))

        by_project = defaultdict(int)
        for e in work:
            if rate_c[e["date"]] == rc:
                by_project[(e["project_id"], e["project_code"])] += e["minutes"]
        if by_project:
            target = half_up(Fraction(rm * rc, 60)) + ot_base + dot_base + wk_base + st_base
            amounts = {k: half_up(Fraction(m * rc, 60)) for k, m in by_project.items()}
            biggest = max(by_project, key=lambda k: by_project[k])
            amounts[biggest] += target - sum(amounts.values())
            for (pid, pcode), m in sorted(by_project.items(), key=lambda kv: kv[0][1]):
                lines.append({"line_type": "PROJECT", "project_id": pid, "project_code": pcode,
                              "hours": hrs(m), "rate": dollars(rc), "amount": dollars(amounts[(pid, pcode)])})
        if om:
            lines.append({"line_type": "OVERTIME_PREMIUM", "project_id": None, "project_code": None,
                          "hours": hrs(om), "rate": dollars(half_up(Fraction(rc, 2))),
                          "amount": dollars(half_up(Fraction(om * rc * 3, 120)) - ot_base)})
        if dm:
            lines.append({"line_type": "OVERTIME_PREMIUM", "project_id": None, "project_code": None,
                          "hours": hrs(dm), "rate": dollars(rc),
                          "amount": dollars(half_up(Fraction(dm * rc * 2, 60)) - dot_base)})
        if wm:
            lines.append({"line_type": "WEEKEND_PREMIUM", "project_id": None, "project_code": None,
                          "hours": hrs(wm), "rate": dollars(half_up(Fraction(rc, 2))),
                          "amount": dollars(half_up(Fraction(wm * rc * 3, 120)) - wk_base)})
        if sm:
            lines.append({"line_type": "STAT_PREMIUM", "project_id": None, "project_code": None,
                          "hours": hrs(sm), "rate": dollars(half_up(Fraction(rc, 2))),
                          "amount": dollars(half_up(Fraction(sm * rc * 3, 120)) - st_base)})
        if sick_min.get(rc):
            amount = half_up(Fraction(sick_min[rc] * rc, 60))
            sick_c += amount
            first = next(e for e in sick if rate_c[e["date"]] == rc)
            lines.append({"line_type": "SICK", "project_id": first["project_id"], "project_code": first["project_code"],
                          "hours": hrs(sick_min[rc]), "rate": dollars(rc), "amount": dollars(amount)})

    paid_c = reg_c + ot_c + dot_c + wk_c + st_c + sick_c
    vac_c = half_up(paid_c * vacation_rate)
    gross_c = paid_c + vac_c
    if vac_c:
        lines.append({"line_type": "VACATION", "project_id": None, "project_code": None,
                      "hours": 0, "rate": 0, "amount": dollars(vac_c)})

    cpp1, cpp2, ei_c = cpp_ei(gross_c, cents(ytd["gross"]), cents(ytd["cpp"]), cents(ytd["ei"]), rates)
    cpp_c = cpp1 + cpp2
    fed_c, prov_c = income_tax(gross_c, cpp1, cpp2, ei_c, rates)
    ded_c = cpp_c + ei_c + fed_c + prov_c
    net_c = gross_c - ded_c
    reg_m = sum(t[0] for t in tiers.values())
    ot_m = sum(t[1] for t in tiers.values())
    dot_m = sum(t[2] for t in tiers.values())
    wk_m = sum(t[3] for t in tiers.values())
    st_m = sum(t[4] for t in tiers.values())
    sick_m = sum(sick_min.values())
    last_rate = rate_c[max(rate_c)]
    return {
        "hourly_rate": dollars(last_rate),
        "regular_hours": hrs(reg_m), "overtime_hours": hrs(ot_m), "double_overtime_hours": hrs(dot_m),
        "regular_pay": dollars(reg_c), "overtime_pay": dollars(ot_c), "double_overtime_pay": dollars(dot_c),
        "weekend_hours": hrs(wk_m), "weekend_pay": dollars(wk_c),
        "stat_hours": hrs(st_m), "stat_pay": dollars(st_c),
        "sick_hours": hrs(sick_m), "sick_pay": dollars(sick_c),
        "vacation_leave_hours": hrs(vac_min),
        "vacation_pay": dollars(vac_c), "gross_pay": dollars(gross_c),
        "cpp": dollars(cpp_c), "ei": dollars(ei_c), "federal_tax": dollars(fed_c), "provincial_tax": dollars(prov_c),
        "total_deductions": dollars(ded_c), "net_pay": dollars(net_c),
        "ytd_hours": round(float(ytd["hours"]) + hrs(reg_m + ot_m + dot_m + wk_m + st_m + sick_m), 2),
        "ytd_gross": dollars(cents(ytd["gross"]) + gross_c), "ytd_cpp": dollars(cents(ytd["cpp"]) + cpp_c),
        "ytd_ei": dollars(cents(ytd["ei"]) + ei_c), "ytd_federal_tax": dollars(cents(ytd["federal"]) + fed_c),
        "ytd_provincial_tax": dollars(cents(ytd["provincial"]) + prov_c), "ytd_net": dollars(cents(ytd["net"]) + net_c),
        "earnings": lines,
    }


def rates_for(year):
    r = R.BY_YEAR.get(year)
    if not r:
        raise HttpError(500, f"No statutory CPP/EI/tax rates configured for {year}. Add them to rates.py before releasing payroll.")
    return r


def mask(last4):
    return "****" + last4 if last4 else None


def deductions_json(r, prefix=""):
    return {"federalTax": r[prefix + "federal_tax"], "provincialTax": r[prefix + "provincial_tax"],
            "cpp": r[prefix + "cpp"], "ei": r[prefix + "ei"]}
