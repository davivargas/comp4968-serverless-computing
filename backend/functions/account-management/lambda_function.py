import os

import boto3

from payroll_common.audit import audit
from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, parse_body, qs, router
from payroll_common.validate import (address, address_json, one_of, opt_int, order_by, paging, path_id, phone_e164, require_date,
                                     require_email, require_int, require_str)

IT = ["IT"]
ELEVATED = ["MANAGER", "PAYROLL_ADMIN", "IT"]
_cognito = None


def cognito():
    global _cognito
    if _cognito is None:
        _cognito = boto3.client("cognito-idp")
    return _cognito


def pool():
    p = os.environ.get("USER_POOL_ID")
    if not p:
        raise RuntimeError("USER_POOL_ID is not set")
    return p


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


def role_id_for(conn, name):
    if name is None or name == "EMPLOYEE":
        return None
    one_of(name, "role", ELEVATED)
    return one(conn, "SELECT role_id FROM role WHERE name = %s", (name,))["role_id"]


def check_position(conn, position_id):
    if not one(conn, "SELECT 1 AS x FROM position WHERE position_id = %s AND NOT is_deleted", (position_id,)):
        raise HttpError(400, f"positionId {position_id} does not exist")


def check_team(conn, team_id):
    if not one(conn, "SELECT 1 AS x FROM team WHERE team_id = %s AND NOT is_deleted", (team_id,)):
        raise HttpError(400, f"teamId {team_id} does not exist")


def get_user(conn, emp_id):
    r = one(conn, f"{USER_SELECT} WHERE e.employee_id = %s", (emp_id,))
    if not r:
        raise HttpError(404, "User not found")
    return user_json(r)


# ---- users -------------------------------------------------------------------------------------------------------
def create_account(event, ctx):
    """POST /it/create-account  body: {firstName, lastName, email, positionId, hireDate, phone?, address?, teamId?, role?}"""
    b = parse_body(event)
    email = require_email(b.get("email"))
    rec = {"first_name": require_str(b.get("firstName"), "firstName", 100), "last_name": require_str(b.get("lastName"), "lastName", 100),
           "email": email, "phone": phone_e164(b["phone"]) if b.get("phone") else None,
           "position_id": require_int(b.get("positionId"), "positionId"), "team_id": opt_int(b.get("teamId"), "teamId"),
           "hire_date": require_date(b.get("hireDate"), "hireDate")}
    addr = address(b["address"]) if b.get("address") else {"street": None, "city": None, "province": None, "postal_code": None, "country": None}
    role = b.get("role")
    if role is not None:
        one_of(role, "role", ["EMPLOYEE"] + ELEVATED)
    if one(get_conn(), "SELECT 1 AS x FROM employee WHERE email = %s", (email,)):
        raise HttpError(409, "An account with that email already exists")
    try:
        out = cognito().admin_create_user(
            UserPoolId=pool(), Username=email, DesiredDeliveryMediums=["EMAIL"],
            UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"},
                            {"Name": "given_name", "Value": rec["first_name"]}, {"Name": "family_name", "Value": rec["last_name"]}])
        sub = next(a["Value"] for a in out["User"]["Attributes"] if a["Name"] == "sub")
    except cognito().exceptions.UsernameExistsException:
        raise HttpError(409, "That email already exists in the user pool")
    try:
        with transaction() as conn:
            check_position(conn, rec["position_id"])
            if rec["team_id"] is not None:
                check_team(conn, rec["team_id"])
            rid = role_id_for(conn, role)
            row = one(conn, """INSERT INTO employee (cognito_sub, first_name, last_name, email, phone, street, city, province, postal_code,
                                                     country, role_id, position_id, team_id, hire_date)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING employee_id""",
                      (sub, rec["first_name"], rec["last_name"], email, rec["phone"], addr["street"], addr["city"], addr["province"],
                       addr["postal_code"], addr["country"], rid, rec["position_id"], rec["team_id"], rec["hire_date"]))
            audit(conn, ctx, "employee", row["employee_id"], "INSERT", None, {**rec, **addr, "role_id": rid})
            out_user = get_user(conn, row["employee_id"])
    except BaseException:
        # keep Cognito and the database consistent: remove the just-created Cognito user
        try:
            cognito().admin_delete_user(UserPoolId=pool(), Username=sub)
        except Exception as e:
            print("Cognito cleanup failed", e)
        raise
    return created(out_user)


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
    "POST /it/create-account": with_auth(IT, create_account),
    "GET /it/users": with_auth(IT, list_users),
    "GET /it/users/{id}": with_auth(IT, get_one),
})
