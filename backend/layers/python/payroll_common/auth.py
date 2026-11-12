from .db import get_conn, one
from .http_utils import HttpError

ROLES = ("EMPLOYEE", "MANAGER", "PAYROLL_ADMIN", "IT")


def authenticate(event):
    claims = ((event.get("requestContext") or {}).get("authorizer") or {}).get("claims") or {}
    if not claims.get("sub"):
        raise HttpError(401, "Unauthenticated")
    conn = get_conn()
    me = one(conn, """SELECT e.employee_id, e.status, e.first_name, e.last_name, e.team_id, r.name AS role
                        FROM employee e LEFT JOIN role r ON r.role_id = e.role_id WHERE e.cognito_sub = %s""", (claims["sub"],))
    if not me:
        raise HttpError(403, "No employee record for this account")
    if me["status"] != "ACTIVE":
        raise HttpError(403, "Account is deactivated")
    available = ["EMPLOYEE", me["role"]] if me["role"] else ["EMPLOYEE"]
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    active = str(headers.get("x-active-role", "EMPLOYEE")).upper()
    if active not in ROLES or active not in available:
        raise HttpError(403, "You do not hold the selected role")
    return {"employee_id": me["employee_id"], "first_name": me["first_name"], "last_name": me["last_name"],
            "name": f"{me['first_name']} {me['last_name']}", "role": me["role"], "team_id": me["team_id"],
            "available": available, "active_role": active}


def with_auth(roles, fn):
    def wrapped(event):
        ctx = authenticate(event)
        if roles and ctx["active_role"] not in roles:
            raise HttpError(403, f"This page requires the {' / '.join(roles)} role")
        return fn(event, ctx)
    return wrapped
