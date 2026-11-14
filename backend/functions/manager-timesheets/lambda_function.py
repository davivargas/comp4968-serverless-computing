from payroll_common.audit import audit
from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, parse_body, qs, router
from payroll_common.shapes import entry_json
from payroll_common.validate import bad, one_of, opt_date, opt_int, order_by, paging, path_id, require_date

MGR = ["MANAGER"]

BASE = """SELECT t.timesheet_id, t.employee_id, e.first_name || ' ' || e.last_name AS employee_name, t.work_date, t.start_time,
                 t.end_time, p.project_code, p.name AS project_name, t.submitted, t.approved
            FROM timesheet_entry t
            JOIN employee e ON e.employee_id = t.employee_id
            JOIN team tm ON tm.team_id = e.team_id AND tm.manager_id = %s
            JOIN project p ON p.project_id = t.project_id
           WHERE NOT t.is_deleted"""


def _json(r):
    out = entry_json(r)
    out["employeeName"] = r["employee_name"]
    out["projectName"] = r["project_name"]
    return out


def list_timesheets(event, ctx):
    """GET /manager/timesheets?status=pending|approved|unsubmitted&employeeId=&from=&to=&sort=date|employee&order=&limit=&offset="""
    q = qs(event)
    params, where = [ctx["employee_id"]], []
    if q.get("status"):
        one_of(q["status"], "status", ["pending", "approved", "unsubmitted"])
        where.append({"pending": "t.submitted AND NOT t.approved", "approved": "t.approved", "unsubmitted": "NOT t.submitted"}[q["status"]])
    emp = opt_int(q.get("employeeId"), "employeeId")
    if emp is not None:
        where.append("t.employee_id = %s")
        params.append(emp)
    for key, op in (("from", ">="), ("to", "<=")):
        d = opt_date(q.get(key), key)
        if d:
            where.append(f"t.work_date {op} %s")
            params.append(d)
    limit, offset = paging(q)
    order = order_by(q, {"date": "t.work_date, t.start_time", "employee": "e.last_name, e.first_name, t.work_date"}, "date")
    rows = query(get_conn(), f"{BASE} {'AND ' + ' AND '.join(where) if where else ''} {order} LIMIT %s OFFSET %s",
                 params + [limit, offset])
    return {"timesheets": [_json(r) for r in rows], "limit": limit, "offset": offset}


def detail(event, ctx):
    """GET /manager/timesheets/{id}"""
    r = one(get_conn(), f"{BASE} AND t.timesheet_id = %s", (ctx["employee_id"], path_id(event)))
    if not r:
        raise HttpError(404, "Timesheet not found, or the employee is not on a team you manage")
    return _json(r)


def _range_for_review(event, ctx):
    emp_id = path_id(event)
    b = parse_body(event)
    frm, to = require_date(b.get("from"), "from"), require_date(b.get("to"), "to")
    if to < frm:
        bad("to must not be before from")
    if emp_id == ctx["employee_id"]:
        raise HttpError(403, "You cannot review your own timesheet")
    return emp_id, frm, to


def _lock_entries(conn, ctx, emp_id, frm, to):
    member = one(conn, """SELECT 1 AS x FROM employee e JOIN team t ON t.team_id = e.team_id
                           WHERE e.employee_id = %s AND t.manager_id = %s""", (emp_id, ctx["employee_id"]))
    if not member:
        raise HttpError(404, "That employee is not on a team you manage")
    return query(conn, """SELECT timesheet_id, submitted, approved FROM timesheet_entry
                           WHERE employee_id = %s AND NOT is_deleted AND work_date BETWEEN %s AND %s FOR UPDATE""", (emp_id, frm, to))


def _result(conn, emp_id, frm, to):
    rows = query(conn, """SELECT t.timesheet_id, t.employee_id, t.work_date, t.start_time, t.end_time, p.project_code, t.submitted, t.approved
                            FROM timesheet_entry t JOIN project p ON p.project_id = t.project_id
                           WHERE t.employee_id = %s AND NOT t.is_deleted AND t.work_date BETWEEN %s AND %s
                           ORDER BY t.work_date, t.start_time""", (emp_id, frm, to))
    return {"entries": [entry_json(r) for r in rows]}


def approve(event, ctx):
    """PATCH /manager/employees/{id}/timesheets/approve  body {from, to}  - approve the whole range"""
    emp_id, frm, to = _range_for_review(event, ctx)
    with transaction() as conn:
        rows = _lock_entries(conn, ctx, emp_id, frm, to)
        if not any(r["submitted"] for r in rows):
            raise HttpError(409, "That employee has no submitted entries in the range")
        if any(not r["submitted"] for r in rows):
            raise HttpError(409, "Some entries in the range are not submitted yet")
        todo = [r["timesheet_id"] for r in rows if not r["approved"]]
        if todo:
            query(conn, """UPDATE timesheet_entry SET approved = true, reviewed_by = %s, reviewed_at = now(), updated_at = now()
                            WHERE timesheet_id = ANY(%s)""", (ctx["employee_id"], todo))
            for tid in todo:
                audit(conn, ctx, "timesheet_entry", tid, "UPDATE", {"approved": False}, {"approved": True, "reviewed_by": ctx["employee_id"]})
        return _result(conn, emp_id, frm, to)


lambda_handler = router({
    "GET /manager/timesheets": with_auth(MGR, list_timesheets),
    "GET /manager/timesheets/{id}": with_auth(MGR, detail),
    "PATCH /manager/employees/{id}/timesheets/approve": with_auth(MGR, approve),
})
