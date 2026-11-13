"""Employee-facing pay information (read-only): aggregate pay and pay stubs (looked up by pay date)."""
import calendar
import datetime

from payroll_common.auth import assert_self
from payroll_common.db import get_conn, query
from payroll_common.http_utils import qs
from payroll_common.payroll import deductions_json, today_bc
from payroll_common.validate import one_of, opt_int, path_id

# SQL group key per granularity (whitelist - never built from user input)
GROUP = {"monthly": "date_trunc('month', pp.pay_date)::date", "quarterly": "date_trunc('quarter', pp.pay_date)::date", "ytd": "DATE '1900-01-01'"}


def _bounds(granularity, key, year):
    """Return the label, start date, and end date for the given granularity and key."""
    if granularity == "monthly":
        last_day_of_month = calendar.monthrange(key.year, key.month)[1]
        return key.strftime("%Y-%m"), key, datetime.date(key.year, key.month, last_day_of_month)
    if granularity == "quarterly":
        end_month = key.month + 2
        return f"{key.year}-Q{(key.month - 1) // 3 + 1}", key, datetime.date(key.year, end_month, calendar.monthrange(key.year, end_month)[1])
    return "YTD", datetime.date(year, 1, 1), min(today_bc(), datetime.date(year, 12, 31))

def aggregate_pay(event, ctx):
    """GET /employee/{id}/aggregate-pay?year=&granularity=ytd|quarterly|monthly"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    query_parameters = qs(event)
    granularity = one_of(query_parameters.get("granularity", "ytd"), "granularity", list(GROUP))
    year = opt_int(query_parameters.get("year"), "year") or today_bc().year
    pay_period_rows = query(get_conn(), f"""
        SELECT {GROUP[granularity]} AS period_key, SUM(ps.regular_hours + ps.overtime_hours + ps.double_overtime_hours) AS hours, SUM(ps.gross_pay) AS gross,
               SUM(ps.federal_tax) AS federal_tax, SUM(ps.provincial_tax) AS provincial_tax, SUM(ps.cpp) AS cpp, SUM(ps.ei) AS ei,
               SUM(ps.net_pay) AS net
          FROM paystub ps JOIN pay_period pp ON pp.pay_period_id = ps.pay_period_id
         WHERE ps.employee_id = %s AND EXTRACT(YEAR FROM pp.pay_date) = %s GROUP BY 1 ORDER BY 1""", (emp_id, year))
    periods = []
    for pay_period_row in pay_period_rows:
        label, start, end = _bounds(granularity, pay_period_row["period_key"], year)
        periods.append({"label": label, "start": start, "end": end, "hours": pay_period_row["hours"], "gross": pay_period_row["gross"],
                        "deductions": deductions_json(pay_period_row), "net": pay_period_row["net"]})
    return {"employeeId": emp_id, "year": year, "granularity": granularity, "periods": periods}