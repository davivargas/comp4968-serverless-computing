from payroll_common.audit import audit
from payroll_common.auth import assert_self, with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, no_content, parse_body, qs, router
from payroll_common.payroll import assert_date_editable, period_containing, today_bc
from payroll_common.shapes import ENTRY_SELECT, entry_json
from payroll_common.validate import bad, opt_date, path_id, require_date, require_int, require_time

EMP = ["EMPLOYEE"]
MAX_BATCH = 200


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


def create_entries(event, ctx):
    """POST /employee/{id}/timesheets  body {entries: [{date, startTime, endTime, projectCode}]}  (all or nothing)"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    items = parse_body(event).get("entries")
    if not isinstance(items, list) or not items:
        bad("entries must be a non-empty list")
    if len(items) > MAX_BATCH:
        bad(f"at most {MAX_BATCH} entries per request")
    parsed = []
    for n, it in enumerate(items, 1):
        if not isinstance(it, dict):
            bad(f"entries[{n}] must be an object")
        d = require_date(it.get("date"), f"entries[{n}].date")
        s, e = require_time(it.get("startTime"), f"entries[{n}].startTime"), require_time(it.get("endTime"), f"entries[{n}].endTime")
        if e <= s:
            bad(f"entries[{n}]: endTime must be after startTime (entries cannot cross midnight)")
        parsed.append({"date": d, "start": s, "end": e, "code": require_int(it.get("projectCode"), f"entries[{n}].projectCode")})
    for i, a in enumerate(parsed):
        for b in parsed[i + 1:]:
            if a["date"] == b["date"] and a["start"] < b["end"] and a["end"] > b["start"]:
                raise HttpError(409, f"Two of the submitted entries overlap on {a['date']}")
    ids = []
    with transaction() as conn:
        query(conn, "SELECT 1 FROM employee WHERE employee_id = %s FOR UPDATE", (emp_id,))
        projects = {}
        for code in {p["code"] for p in parsed}:
            pr = one(conn, """SELECT p.project_id, p.status FROM project p JOIN project_assignment a ON a.project_id = p.project_id
                               WHERE p.project_code = %s AND a.employee_id = %s AND NOT p.is_deleted""", (code, emp_id))
            if not pr:
                raise HttpError(400, f"Unknown project code {code}, or you are not assigned to that project")
            if pr["status"] != "ACTIVE":
                raise HttpError(400, f"Project {code} is closed")
            projects[code] = pr["project_id"]
        for d in sorted({p["date"] for p in parsed}):
            assert_date_editable(conn, d)
        for p in parsed:
            if one(conn, """SELECT 1 AS x FROM timesheet_entry WHERE employee_id = %s AND work_date = %s AND NOT is_deleted
                               AND start_time < %s AND end_time > %s""", (emp_id, p["date"], p["end"], p["start"])):
                raise HttpError(409, f"An entry on {p['date']} overlaps one you already saved")
            row = one(conn, """INSERT INTO timesheet_entry (employee_id, project_id, work_date, start_time, end_time)
                               VALUES (%s, %s, %s, %s, %s) RETURNING timesheet_id""",
                      (emp_id, projects[p["code"]], p["date"], p["start"], p["end"]))
            ids.append(row["timesheet_id"])
            audit(conn, ctx, "timesheet_entry", row["timesheet_id"], "INSERT", None,
                  {"employee_id": emp_id, "project_id": projects[p["code"]], "work_date": p["date"],
                   "start_time": p["start"], "end_time": p["end"]})
        rows = query(conn, f"{ENTRY_SELECT} WHERE t.timesheet_id = ANY(%s) ORDER BY t.work_date, t.start_time", (ids,))
    return created({"entries": [entry_json(r) for r in rows]})


def delete_entry(event, ctx):
    """DELETE /employee/{id}/timesheets/{timesheetId}  - soft delete, only before submission"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    tid = path_id(event, "timesheetId")
    with transaction() as conn:
        e = one(conn, "SELECT * FROM timesheet_entry WHERE timesheet_id = %s AND employee_id = %s AND NOT is_deleted FOR UPDATE", (tid, emp_id))
        if not e:
            raise HttpError(404, "Timesheet entry not found")
        if e["submitted"]:
            raise HttpError(409, "A submitted entry can no longer be deleted")
        assert_date_editable(conn, e["work_date"])
        query(conn, "UPDATE timesheet_entry SET is_deleted = true, updated_at = now() WHERE timesheet_id = %s", (tid,))
        audit(conn, ctx, "timesheet_entry", tid, "DELETE", {"is_deleted": False}, {"is_deleted": True})
    return no_content()


lambda_handler = router({
    "GET /employee/{id}/pay-period": with_auth(EMP, pay_period),
    "GET /employee/{id}/timesheets": with_auth(EMP, list_entries),
    "POST /employee/{id}/timesheets": with_auth(EMP, create_entries),
    "DELETE /employee/{id}/timesheets/{timesheetId}": with_auth(EMP, delete_entry),
})
