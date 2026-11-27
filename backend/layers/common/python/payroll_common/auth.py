from .db import get_conn, one
from .http_utils import HttpError

ROLES = ("EMPLOYEE", "MANAGER", "PAYROLL_ADMIN", "IT", "AUDITOR")


def authenticate(event):
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    if not claims.get("sub"):
        raise HttpError(401, "Unauthenticated")
    conn = get_conn()
    me = one(conn, """SELECT e.employee_id, e.status, e.first_name, e.last_name, e.team_id, r.name AS role
                        FROM employee e LEFT JOIN role r ON r.role_id = e.role_id WHERE e.cognito_sub = %s""", (claims["sub"],))
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not me:
        auditor = one(conn, "SELECT auditor_id, status, first_name, last_name FROM auditor WHERE cognito_sub = %s", (claims["sub"],))
        if not auditor:
            raise HttpError(403, "No employee record for this account")
        if auditor["status"] != "ACTIVE":
            raise HttpError(403, "Account is deactivated")
        active = str(headers.get("x-active-role", "AUDITOR")).upper()
        if active != "AUDITOR":
            raise HttpError(403, "You do not hold the selected role")
        return {"employee_id": None, "auditor_id": auditor["auditor_id"], "first_name": auditor["first_name"],
                "last_name": auditor["last_name"], "name": f"{auditor['first_name']} {auditor['last_name']}", "role": "AUDITOR",
                "team_id": None, "available": ["AUDITOR"], "active_role": "AUDITOR"}
    if me["status"] != "ACTIVE":
        raise HttpError(403, "Account is deactivated")
    available = ["EMPLOYEE", me["role"]] if me["role"] else ["EMPLOYEE"]
    active = str(headers.get("x-active-role", "EMPLOYEE")).upper()
    if active not in ROLES or active not in available:
        raise HttpError(403, "You do not hold the selected role")
    return {"employee_id": me["employee_id"], "auditor_id": None, "first_name": me["first_name"], "last_name": me["last_name"],
            "name": f"{me['first_name']} {me['last_name']}", "role": me["role"], "team_id": me["team_id"],
            "available": available, "active_role": active}


def with_auth(roles, fn):
    def wrapped(event):
        ctx = authenticate(event)
        if ctx.get("auditor_id") and roles is not None and "AUDITOR" not in roles:
            raise HttpError(403, "Auditors can only use the audit log")
        if roles and ctx["active_role"] not in roles:
            raise HttpError(403, f"This page requires the {' / '.join(roles)} role")
        return fn(event, ctx)
    return wrapped


def assert_self(ctx, emp_id):
    if ctx["employee_id"] != emp_id:
        raise HttpError(403, "You can only access your own records")
