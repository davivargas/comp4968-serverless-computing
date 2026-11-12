from payroll_common.payroll import today_bc
from payroll_common.validate import address_json, bad, one_of, opt_date, opt_int, order_by, paging, path_id


def _period_filter(q):
    pay_date, frm, to = opt_date(q.get("payDate"), "payDate"), opt_date(q.get("fromPayDate"), "fromPayDate"), opt_date(q.get("toPayDate"), "toPayDate")
    if pay_date:
        return "pp.pay_date = %s", [pay_date], f"pay date {pay_date}"
    if frm or to:
        parts, params = [], []
        if frm:
            parts.append("pp.pay_date >= %s")
            params.append(frm)
        if to:
            parts.append("pp.pay_date <= %s")
            params.append(to)
        return " AND ".join(parts), params, "selected pay dates"
    year = opt_int(q.get("year"), "year") or today_bc().year
    return "EXTRACT(YEAR FROM pp.pay_date) = %s", [year], f"year {year}"


AGG = """SELECT COALESCE(SUM(ps.regular_hours + ps.overtime_hours + ps.double_overtime_hours), 0) AS hours,
                COALESCE(SUM(ps.gross_pay), 0) AS gross, COALESCE(SUM(ps.total_deductions), 0) AS deductions, COALESCE(SUM(ps.net_pay), 0) AS net
           FROM paystub ps JOIN pay_period pp ON pp.pay_period_id = ps.pay_period_id"""
