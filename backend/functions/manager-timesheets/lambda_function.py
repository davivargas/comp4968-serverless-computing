from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query
from payroll_common.http_utils import HttpError, qs, router
from payroll_common.shapes import entry_json
from payroll_common.validate import one_of, opt_date, opt_int, order_by, paging, path_id

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


lambda_handler = router({
    "GET /manager/timesheets": with_auth(MGR, list_timesheets),
    "GET /manager/timesheets/{id}": with_auth(MGR, detail),
})
