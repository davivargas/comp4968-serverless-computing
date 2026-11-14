from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query
from payroll_common.http_utils import HttpError, qs, router
from payroll_common.validate import address_json, one_of, order_by, paging, path_id, require_int

IT = ["IT"]
ELEVATED = ["MANAGER", "PAYROLL_ADMIN", "IT"]


USER_SELECT = """SELECT e.employee_id, e.first_name, e.last_name, e.email, e.phone, e.street, e.city, e.province, e.postal_code, e.country,
                        e.status, e.hire_date, COALESCE(r.name, 'EMPLOYEE') AS role, p.position_id, p.title AS position,
                        e.team_id, t.name AS team, t.manager_id, m.first_name || ' ' || m.last_name AS manager_name
                   FROM employee e
                   JOIN position p ON p.position_id = e.position_id
                   LEFT JOIN role r ON r.role_id = e.role_id
                   LEFT JOIN team t ON t.team_id = e.team_id
                   LEFT JOIN employee m ON m.employee_id = t.manager_id"""


def user_json(r):
    return {"employeeId": r["employee_id"], "firstName": r["first_name"], "lastName": r["last_name"], "email": r["email"],
            "phone": r["phone"], "address": address_json(r), "status": r["status"], "hireDate": r["hire_date"], "role": r["role"],
            "positionId": r["position_id"], "position": r["position"], "teamId": r["team_id"], "team": r["team"],
            "managerId": r["manager_id"], "managerName": r["manager_name"]}


def get_user(conn, emp_id):
    r = one(conn, f"{USER_SELECT} WHERE e.employee_id = %s", (emp_id,))
    if not r:
        raise HttpError(404, "User not found")
    return user_json(r)


# ---- users -------------------------------------------------------------------------------------------------------
def list_users(event, ctx):
    """GET /it/users?status=&role=&teamId=&search=&sort=id|name|email&order=&limit=&offset="""
    q = qs(event)
    where, p = [], []
    if q.get("status"):
        p.append(one_of(q["status"], "status", ["ACTIVE", "DEACTIVATED"]))
        where.append("u.status = %s")
    if q.get("role"):
        p.append(one_of(q["role"], "role", ["EMPLOYEE"] + ELEVATED))
        where.append("u.role = %s")
    if q.get("teamId"):
        p.append(require_int(q["teamId"], "teamId"))
        where.append("u.team_id = %s")
    if q.get("search"):
        p += [f"%{q['search']}%", f"%{q['search']}%"]
        where.append("(u.first_name || ' ' || u.last_name ILIKE %s OR u.email ILIKE %s)")
    limit, offset = paging(q)
    order = order_by(q, {"id": "u.employee_id", "name": "u.last_name, u.first_name", "email": "u.email"}, "id")
    rows = query(get_conn(), f"""SELECT u.*, COUNT(*) OVER()::int AS total_count FROM ({USER_SELECT}) u
                                  {'WHERE ' + ' AND '.join(where) if where else ''} {order} LIMIT %s OFFSET %s""", p + [limit, offset])
    return {"total": rows[0]["total_count"] if rows else 0, "limit": limit, "offset": offset, "users": [user_json(r) for r in rows]}


def get_one(event, ctx):
    """GET /it/users/{id}"""
    return get_user(get_conn(), path_id(event))


lambda_handler = router({
    "GET /it/users": with_auth(IT, list_users),
    "GET /it/users/{id}": with_auth(IT, get_one),
})
