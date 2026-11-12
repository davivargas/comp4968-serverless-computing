"""Payroll release (pay-period level) and position / wage administration (Payroll Admin)."""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from payroll_common import payroll as payroll
from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query
from payroll_common.http_utils import router
from payroll_common.validate import bad

PAYROLL_ADMIN_ROLES = ["PAYROLL_ADMIN"]

# ---- positions and wages (Payroll Admin) --------------------------------------------------------------------

def money(value, field_name):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        bad(f"{field_name} must be a number")
    try:
        decimal_value = Decimal(str(value))
    except InvalidOperation:
        bad(f"{field_name} must be a number")
    if not decimal_value.is_finite() or decimal_value < 0 or decimal_value > 10000:
        bad(f"{field_name} must be between 0 and 10000")
    if decimal_value != decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP):
        bad(f"{field_name} can have at most 2 decimal places")
    return decimal_value.quantize(Decimal("0.01"))

def position_json(connection, position_id):
    today = payroll.today_bc()
    position = one(connection, "SELECT position_id, title, pay_grade FROM position WHERE position_id = %s", (position_id,))
    wage_rows = query(connection, "SELECT hourly_wage, effective_from FROM position_wage WHERE position_id = %s ORDER BY effective_from", (position_id,))
    current_wages = [wage_row for wage_row in wage_rows if wage_row["effective_from"] <= today]
    next_wages = [wage_row for wage_row in wage_rows if wage_row["effective_from"] > today]
    current_wage = current_wages[-1] if current_wages else None
    return {"positionId": position["position_id"], "title": position["title"], "payGrade": position["pay_grade"],
            "hourlyRate": current_wage["hourly_wage"] if current_wage else None,
            "effectiveFrom": current_wage["effective_from"] if current_wage else None,
            "nextWage": {"hourlyRate": next_wages[0]["hourly_wage"], "effectiveFrom": next_wages[0]["effective_from"]}
            if next_wages else None}


def list_positions(event, request_context):
    """GET /pa/positions - with wages. Deleted positions are not listed."""
    connection = get_conn()
    position_rows = query(connection, "SELECT position_id FROM position WHERE NOT is_deleted ORDER BY title")
    return {"positions": [position_json(connection, position_row["position_id"]) for position_row in position_rows]}

lambda_handler = router({
    "GET /pa/positions": with_auth(PAYROLL_ADMIN_ROLES, list_positions),
})