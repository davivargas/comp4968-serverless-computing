"""Person 3 - projects (managers create and manage their own) and employee-to-project assignments."""
from payroll_common.audit import audit
from payroll_common.auth import assert_self, with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, no_content, parse_body, qs, router
from payroll_common.validate import (bad, one_of, opt_int, order_by, path_id, require_bool_true, require_int, require_str)

EMP = ["EMPLOYEE"]
MGR = ["MANAGER"]

PROJECT_SELECT = """SELECT p.project_id, p.project_code, p.name, p.status,
                           (SELECT COUNT(*) FROM project_assignment a WHERE a.project_id = p.project_id)::int AS employee_count
                      FROM project p"""


def _project(r):
    return {"projectId": r["project_id"], "projectCode": r["project_code"], "name": r["name"], "status": r["status"],
            "employeeCount": r["employee_count"]}


def employee_projects(event, ctx):
    """GET /employee/{id}/projects?search=  - active projects this employee is assigned to (timesheet dropdown)"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    q = qs(event)
    params, where = [emp_id], ["a.employee_id = %s", "p.status = 'ACTIVE'", "NOT p.is_deleted"]
    if q.get("search"):
        where.append("(p.name ILIKE %s OR CAST(p.project_code AS TEXT) LIKE %s)")
        params += [f"%{q['search']}%", f"%{q['search']}%"]
    rows = query(get_conn(), f"""SELECT p.project_code, p.name FROM project p JOIN project_assignment a ON a.project_id = p.project_id
                                  WHERE {' AND '.join(where)} ORDER BY p.project_code""", params)
    return {"projects": [{"projectCode": r["project_code"], "name": r["name"]} for r in rows]}


def list_projects(event, ctx):
    """GET /manager/projects - projects this manager created (deleted ones are not listed)"""
    rows = query(get_conn(), f"{PROJECT_SELECT} WHERE p.created_by = %s AND NOT p.is_deleted ORDER BY p.project_code", (ctx["employee_id"],))
    return {"projects": [_project(r) for r in rows]}


def project_employees(event, ctx):
    """GET /manager/projects/{id}/employees"""
    project_id = path_id(event)
    conn = get_conn()
    proj = one(conn, "SELECT project_id, project_code, created_by FROM project WHERE project_id = %s AND NOT is_deleted", (project_id,))
    if not proj:
        raise HttpError(404, "Project not found")
    if proj["created_by"] != ctx["employee_id"]:
        raise HttpError(403, "You can only view projects you created")
    rows = query(conn, """SELECT e.employee_id, e.first_name, e.last_name, e.status FROM project_assignment a
                            JOIN employee e ON e.employee_id = a.employee_id WHERE a.project_id = %s
                           ORDER BY e.last_name, e.first_name""", (project_id,))
    return {"projectId": project_id, "projectCode": proj["project_code"],
            "employees": [{"employeeId": r["employee_id"], "firstName": r["first_name"], "lastName": r["last_name"],
                           "status": r["status"]} for r in rows]}


def create_project(event, ctx):
    """POST /manager/projects  body: {projectCode, name}  (the code is generated when omitted)"""
    b = parse_body(event)
    name = require_str(b.get("name"), "name", 200)
    code = opt_int(b.get("projectCode"), "projectCode")
    if code is not None and code < 1:
        bad("projectCode must be a positive integer")
    with transaction() as conn:
        query(conn, "LOCK TABLE project IN SHARE ROW EXCLUSIVE MODE")   # keeps generated codes unique under concurrency
        if code is None:
            code = one(conn, "SELECT COALESCE(MAX(project_code), 0) + 1 AS n FROM project")["n"]
        elif one(conn, "SELECT 1 AS x FROM project WHERE project_code = %s", (code,)):
            raise HttpError(409, "That project code is already in use")
        row = one(conn, "INSERT INTO project (project_code, name, created_by) VALUES (%s, %s, %s) RETURNING project_id",
                  (code, name, ctx["employee_id"]))
        audit(conn, ctx, "project", row["project_id"], "INSERT", None, {"project_code": code, "name": name, "created_by": ctx["employee_id"]})
        out = one(conn, f"{PROJECT_SELECT} WHERE p.project_id = %s", (row["project_id"],))
    return created(_project(out))


def update_project(event, ctx):
    """PATCH /manager/projects/{id}  body: any of {name, status, isDeleted: true}"""
    pid = path_id(event)
    b = parse_body(event)
    ch = {}
    if "name" in b:
        ch["name"] = require_str(b["name"], "name", 200)
    if "status" in b:
        ch["status"] = one_of(b["status"], "status", ["ACTIVE", "CLOSED"])
    deleting = "isDeleted" in b and require_bool_true(b["isDeleted"], "isDeleted")
    if not ch and not deleting:
        bad("No updatable fields supplied")
    with transaction() as conn:
        old = one(conn, "SELECT * FROM project WHERE project_id = %s AND NOT is_deleted FOR UPDATE", (pid,))
        if not old:
            raise HttpError(404, "Project not found")
        if old["created_by"] != ctx["employee_id"]:
            raise HttpError(403, "You can only change projects you created")
        if deleting:
            used = one(conn, """SELECT (SELECT COUNT(*) FROM project_assignment WHERE project_id = %s)::int AS assigned,
                                       (SELECT COUNT(*) FROM timesheet_entry WHERE project_id = %s)::int AS entries""", (pid, pid))
            if used["assigned"] or used["entries"]:
                raise HttpError(409, "This project has assigned employees or timesheet entries; close it instead of deleting it")
        if ch:
            cols = list(ch)
            query(conn, f"UPDATE project SET {', '.join(c + ' = %s' for c in cols)} WHERE project_id = %s", [ch[c] for c in cols] + [pid])
            audit(conn, ctx, "project", pid, "UPDATE", {c: old[c] for c in cols}, ch)
        if deleting:
            query(conn, "UPDATE project SET is_deleted = true WHERE project_id = %s", (pid,))
            audit(conn, ctx, "project", pid, "DELETE", {"is_deleted": False}, {"is_deleted": True})
            return no_content()
        return _project(one(conn, f"{PROJECT_SELECT} WHERE p.project_id = %s", (pid,)))


def assign_employee(event, ctx):
    """POST /manager/{id}/assign-employee  ({id} = project id)  body: {employeeId}
    A manager can assign only projects they created, and only themself or active employees on a team they manage."""
    project_id = path_id(event)
    emp_id = require_int(parse_body(event).get("employeeId"), "employeeId")
    with transaction() as conn:
        proj = one(conn, "SELECT project_id, created_by, status FROM project WHERE project_id = %s AND NOT is_deleted", (project_id,))
        if not proj:
            raise HttpError(404, "Project not found")
        if proj["created_by"] != ctx["employee_id"]:
            raise HttpError(403, "You can only assign employees to projects you created")
        if proj["status"] != "ACTIVE":
            raise HttpError(409, "That project is closed")
        member = emp_id == ctx["employee_id"] or one(     # a manager may assign themself (the topmost person has no manager)
            conn, """SELECT 1 AS x FROM employee e JOIN team t ON t.team_id = e.team_id
                      WHERE e.employee_id = %s AND t.manager_id = %s AND e.status = 'ACTIVE'""", (emp_id, ctx["employee_id"]))
        if not member:
            raise HttpError(400, "That employee is not an active member of a team you manage")
        inserted = query(conn, """INSERT INTO project_assignment (project_id, employee_id, assigned_by) VALUES (%s, %s, %s)
                                  ON CONFLICT DO NOTHING RETURNING employee_id""", (project_id, emp_id, ctx["employee_id"]))
        if inserted:
            audit(conn, ctx, "project_assignment", f"{project_id}:{emp_id}", "INSERT", None,
                  {"project_id": project_id, "employee_id": emp_id, "assigned_by": ctx["employee_id"]})
    body = {"projectId": project_id, "employeeId": emp_id, "alreadyAssigned": not inserted}
    return created(body) if inserted else body


def manager_employees(event, ctx):
    """GET /manager/{id}/employees  ({id} = the manager's own id)  ?projectId=&sort=name|id"""
    mgr_id = path_id(event)
    assert_self(ctx, mgr_id)
    q = qs(event)
    params, where = [mgr_id], ["t.manager_id = %s"]
    pid = opt_int(q.get("projectId"), "projectId")
    if pid is not None:
        where.append("EXISTS (SELECT 1 FROM project_assignment a WHERE a.employee_id = e.employee_id AND a.project_id = %s)")
        params.append(pid)
    order = order_by(q, {"name": "e.last_name, e.first_name", "id": "e.employee_id"}, "name")
    rows = query(get_conn(), f"""SELECT e.employee_id, e.first_name, e.last_name, e.email, e.status, p.title AS position, t.name AS team
                                  FROM employee e JOIN team t ON t.team_id = e.team_id JOIN position p ON p.position_id = e.position_id
                                 WHERE {' AND '.join(where)} {order}""", params)
    return {"employees": [{"employeeId": r["employee_id"], "firstName": r["first_name"], "lastName": r["last_name"],
                           "email": r["email"], "status": r["status"], "position": r["position"], "team": r["team"]} for r in rows]}


lambda_handler = router({
    "GET /employee/{id}/projects": with_auth(EMP, employee_projects),
    "GET /manager/projects": with_auth(MGR, list_projects),
    "GET /manager/projects/{id}/employees": with_auth(MGR, project_employees),
    "POST /manager/projects": with_auth(MGR, create_project),
    "PATCH /manager/projects/{id}": with_auth(MGR, update_project),
    "POST /manager/{id}/assign-employee": with_auth(MGR, assign_employee),
    "GET /manager/{id}/employees": with_auth(MGR, manager_employees),
})
