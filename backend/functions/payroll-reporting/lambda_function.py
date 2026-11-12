from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query
from payroll_common.http_utils import HttpError, qs, router
from payroll_common.payroll import today_bc
from payroll_common.shapes import WAGE_JOIN
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


def list_employees(event, ctx):
    q = qs(event)
    pf_sql, pf_params, label = _period_filter(q)
    params, where = list(pf_params), []
    if q.get("status"):
        where.append("e.status = %s")
        params.append(one_of(q["status"], "status", ["ACTIVE", "DEACTIVATED"]))
    if q.get("search"):
        where.append("(e.first_name || ' ' || e.last_name) ILIKE %s")
        params.append(f"%{q['search']}%")
    for key, col in (("positionId", "e.position_id"), ("teamId", "e.team_id")):
        v = opt_int(q.get(key), key)
        if v is not None:
            where.append(f"{col} = %s")
            params.append(v)
    pid = opt_int(q.get("projectId"), "projectId")
    if pid is not None:
        where.append("EXISTS (SELECT 1 FROM project_assignment pa WHERE pa.employee_id = e.employee_id AND pa.project_id = %s)")
        params.append(pid)
