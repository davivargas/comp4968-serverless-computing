"""Payroll release (pay-period level) and position / wage administration (Payroll Admin)."""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from payroll_common import payroll as payroll
from payroll_common.validate import bad

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


