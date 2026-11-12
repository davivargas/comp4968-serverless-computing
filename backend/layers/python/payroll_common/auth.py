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
