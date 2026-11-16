from collections import defaultdict

from payroll_common.audit import audit
from payroll_common.auth import assert_self, with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, no_content, parse_body, qs, router
from payroll_common.payroll import assert_date_editable, period_containing, sick_days_per_year, sick_dates_used, today_bc
from payroll_common.shapes import ENTRY_SELECT, entry_json
from payroll_common.validate import opt_date, opt_int, path_id, require_date, require_int, require_str, require_time, bad

EMP = ["EMPLOYEE"]
MAX_BATCH = 200


def pay_period(event, ctx):
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
        projects, special = {}, {}
        for code in {p["code"] for p in parsed}:
            pr = one(conn, """SELECT p.project_id, p.status, p.special_type FROM project p
                               LEFT JOIN project_assignment a ON a.project_id = p.project_id AND a.employee_id = %s
                               WHERE p.project_code = %s AND NOT p.is_deleted
                                 AND (a.employee_id IS NOT NULL OR p.special_type IS NOT NULL)""", (emp_id, code))
            if not pr:
                raise HttpError(400, f"Unknown project code {code}, or you are not assigned to that project")
            if pr["status"] != "ACTIVE":
                raise HttpError(400, f"Project {code} is closed")
            projects[code] = pr["project_id"]
            special[code] = pr["special_type"]
        for d in sorted({p["date"] for p in parsed}):
            assert_date_editable(conn, d)
        new_sick = defaultdict(set)
        for p in parsed:
            if special[p["code"]] == "SICK":
                new_sick[p["date"].year].add(p["date"])
        allowed = sick_days_per_year()
        for year, dates in new_sick.items():
            used = set(sick_dates_used(conn, emp_id, year))
            if len(used | dates) > allowed:
                raise HttpError(409, f"Only {allowed} sick days are allowed per calendar year; {len(used)} already used in {year}",
                                {"year": year, "allowed": allowed, "used": len(used), "remaining": max(allowed - len(used), 0)})
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


def sick_days(event, ctx):
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    year = opt_int(qs(event).get("year"), "year") or today_bc().year
    if year < 2000 or year > 2100:
        bad("year must be between 2000 and 2100")
    dates = sick_dates_used(get_conn(), emp_id, year)
    allowed = sick_days_per_year()
    return {"employeeId": emp_id, "year": year, "allowed": allowed, "used": len(dates),
            "remaining": max(allowed - len(dates), 0), "dates": dates}


def delete_entry(event, ctx):
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


def submit_period(event, ctx):
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    b = parse_body(event)
    frm, to = require_date(b.get("from"), "from"), require_date(b.get("to"), "to")
    if to < frm:
        bad("to must not be before from")
    with transaction() as conn:
        p1, p2 = assert_date_editable(conn, frm), assert_date_editable(conn, to)
        if p1["pay_period_id"] != p2["pay_period_id"]:
            raise HttpError(409, "from and to must be inside the same pay period")
        drafts = query(conn, """SELECT timesheet_id FROM timesheet_entry WHERE employee_id = %s AND NOT is_deleted AND NOT submitted
                                   AND work_date BETWEEN %s AND %s FOR UPDATE""", (emp_id, frm, to))
        if not drafts:
            raise HttpError(409, "There are no unsubmitted entries in that range")
        topmost = one(conn, "SELECT team_id FROM employee WHERE employee_id = %s", (emp_id,))["team_id"] is None
        ids = [d["timesheet_id"] for d in drafts]
        query(conn, """UPDATE timesheet_entry SET submitted = true, submitted_at = now(), approved = %s, reviewed_by = NULL,
                          reviewed_at = CASE WHEN %s THEN now() END, updated_at = now() WHERE timesheet_id = ANY(%s)""",
              (topmost, topmost, ids))
        for tid in ids:
            audit(conn, ctx, "timesheet_entry", tid, "UPDATE", {"submitted": False}, {"submitted": True, "approved": topmost})
        rows = query(conn, f"""{ENTRY_SELECT} WHERE t.employee_id = %s AND NOT t.is_deleted AND t.work_date BETWEEN %s AND %s
                                ORDER BY t.work_date, t.start_time""", (emp_id, frm, to))
    return {"entries": [entry_json(r) for r in rows]}


lambda_handler = router({
    "GET /employee/{id}/pay-period": with_auth(EMP, pay_period),
    "GET /employee/{id}/timesheets": with_auth(EMP, list_entries),
    "GET /employee/{id}/sick-days": with_auth(EMP, sick_days),
    "POST /employee/{id}/timesheets": with_auth(EMP, create_entries),
    "DELETE /employee/{id}/timesheets/{timesheetId}": with_auth(EMP, delete_entry),
    "PATCH /employee/{id}/timesheets/submit": with_auth(EMP, submit_period),
})
