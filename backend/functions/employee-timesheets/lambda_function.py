from payroll_common.auth import assert_self, with_auth
from payroll_common.db import get_conn, query, transaction
from payroll_common.http_utils import HttpError, qs, router
from payroll_common.payroll import period_containing, today_bc
from payroll_common.shapes import ENTRY_SELECT, entry_json
from payroll_common.validate import bad, opt_date, path_id, require_date

EMP = ["EMPLOYEE"]


def pay_period(event, ctx):
    """GET /employee/{id}/pay-period?date=  - the bi-weekly period containing the date (default today)."""
    assert_self(ctx, path_id(event))
    d = opt_date(qs(event).get("date"), "date") or today_bc()
    with transaction() as conn:
        p = period_containing(conn, d)
    if p is None:
        raise HttpError(404, "That date is before the first pay period")
    today = today_bc()
    return {"start": p["start_date"], "end": p["end_date"], "payDate": p["pay_date"],
            "isCurrent": p["start_date"] <= today <= p["end_date"], "editable": p["status"] == "OPEN"}


def list_entries(event, ctx):
    """GET /employee/{id}/timesheets?from=&to="""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    q = qs(event)
    frm, to = require_date(q.get("from"), "from"), require_date(q.get("to"), "to")
    if to < frm:
        bad("to must not be before from")
    rows = query(get_conn(), f"""{ENTRY_SELECT} WHERE t.employee_id = %s AND NOT t.is_deleted AND t.work_date BETWEEN %s AND %s
                                  ORDER BY t.work_date, t.start_time""", (emp_id, frm, to))
    return {"entries": [entry_json(r) for r in rows]}


lambda_handler = router({
    "GET /employee/{id}/pay-period": with_auth(EMP, pay_period),
    "GET /employee/{id}/timesheets": with_auth(EMP, list_entries),
})
