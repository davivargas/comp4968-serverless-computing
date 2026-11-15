"""Payroll release (pay-period level) and position / wage administration (Payroll Admin)."""
import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from payroll_common import payroll as payroll
from payroll_common.audit import audit
from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, no_content, parse_body, router, qs
from payroll_common.release import release_period
from payroll_common.validate import bad, opt_int, paging, path_id, require_bool_true, require_date, require_str


PAYROLL_ADMIN_ROLES = ["PAYROLL_ADMIN"]

# ---- pay periods ---------------------------------------------------------------------------------------------

def list_periods(event, request_context):
    """GET /pa/pay-periods?limit=&offset=  - canRelease drives the Release button."""
    today = payroll.today_bc()
    limit, offset = paging(qs(event), 26, 100)
    with transaction() as connection:
        payroll.ensure_periods(connection, today)
    pay_period_rows = query(get_conn(), """
        SELECT pay_period.pay_period_id, pay_period.start_date, pay_period.end_date, pay_period.pay_date,
               pay_period.status, pay_period.released_at,
               (SELECT COUNT(*) FROM timesheet_entry WHERE NOT timesheet_entry.is_deleted
                   AND timesheet_entry.work_date BETWEEN pay_period.start_date AND pay_period.end_date
                   AND NOT timesheet_entry.approved)::int AS unapproved_count,
               (SELECT COUNT(DISTINCT timesheet_entry.employee_id) FROM timesheet_entry
                   WHERE NOT timesheet_entry.is_deleted
                   AND timesheet_entry.work_date BETWEEN pay_period.start_date AND pay_period.end_date)::int AS employee_count
          FROM pay_period WHERE pay_period.start_date <= %s
          ORDER BY pay_period.start_date DESC LIMIT %s OFFSET %s""", (today, limit, offset))
    return {"payPeriods": [{
        "payPeriodId": pay_period_row["pay_period_id"], "start": pay_period_row["start_date"],
        "end": pay_period_row["end_date"], "payDate": pay_period_row["pay_date"],
        "status": pay_period_row["status"], "unapprovedCount": pay_period_row["unapproved_count"],
        "employeeCount": pay_period_row["employee_count"],
        "canRelease": pay_period_row["status"] == "OPEN" and pay_period_row["end_date"] < today
                      and pay_period_row["unapproved_count"] == 0 and pay_period_row["employee_count"] > 0,
        "releasedAt": pay_period_row["released_at"]} for pay_period_row in pay_period_rows]}
    
    
def release(event, request_context):
    """PATCH /pa/payroll/{id}/release"""
    pay_period_id = path_id(event)

    with transaction() as connection:
        return release_period(connection, pay_period_id, request_context)
        
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


def _title_taken(connection, title, excluded_position_id=None):
    return one(connection, "SELECT 1 AS position_exists FROM position WHERE lower(title) = lower(%s) AND NOT is_deleted AND position_id <> %s",
               (title, excluded_position_id or 0))


def create_position(event, request_context):
    """POST /pa/positions  body {title, payGrade, hourlyRate, effectiveFrom}"""
    request_body = parse_body(event)
    title = require_str(request_body.get("title"), "title", 100)
    pay_grade = require_str(request_body.get("payGrade"), "payGrade", 30)
    hourly_wage = money(request_body.get("hourlyRate"), "hourlyRate")
    effective_from = require_date(request_body.get("effectiveFrom"), "effectiveFrom")
    with transaction() as connection:
        if _title_taken(connection, title):
            raise HttpError(409, "A position with that title already exists")
        inserted_position = one(connection, "INSERT INTO position (title, pay_grade) VALUES (%s, %s) RETURNING position_id", (title, pay_grade))
        position_id = inserted_position["position_id"]
        query(connection, "INSERT INTO position_wage (position_id, hourly_wage, effective_from, created_by) VALUES (%s, %s, %s, %s)",
              (position_id, hourly_wage, effective_from, request_context["employee_id"]))
        audit(connection, request_context, "position", position_id, "INSERT", None, {"title": title, "pay_grade": pay_grade})
        audit(connection, request_context, "position_wage", f"{position_id}:{effective_from}", "INSERT", None,
              {"position_id": position_id, "hourly_wage": hourly_wage, "effective_from": effective_from})
        return created(position_json(connection, position_id))


def update_position(event, request_context):
    """PATCH /pa/positions/{id}  any of {title, payGrade, hourlyRate + effectiveFrom, isDeleted: true}"""
    position_id = path_id(event)
    request_body = parse_body(event)
    changed_position_fields = {}
    if "title" in request_body:
        changed_position_fields["title"] = require_str(request_body["title"], "title", 100)
    if "payGrade" in request_body:
        changed_position_fields["pay_grade"] = require_str(request_body["payGrade"], "payGrade", 30)
    new_wage_details = None
    if "hourlyRate" in request_body or "effectiveFrom" in request_body:
        if "hourlyRate" not in request_body or "effectiveFrom" not in request_body:
            bad("A wage change needs hourlyRate and effectiveFrom together")
        new_wage_details = (
            money(request_body["hourlyRate"], "hourlyRate"),
            require_date(request_body["effectiveFrom"], "effectiveFrom")
        )
    deleting_position = "isDeleted" in request_body and require_bool_true(request_body["isDeleted"], "isDeleted")
    if not changed_position_fields and not new_wage_details and not deleting_position:
        bad("No updatable fields supplied")
    with transaction() as connection:
        old_position = one(connection, "SELECT * FROM position WHERE position_id = %s AND NOT is_deleted FOR UPDATE", (position_id,))
        if not old_position:
            raise HttpError(404, "Position not found")
        if deleting_position and one(connection, "SELECT 1 AS employee_exists FROM employee WHERE position_id = %s", (position_id,)):
            raise HttpError(409, "Employees still hold this position; change their position first")
        if "title" in changed_position_fields and _title_taken(connection, changed_position_fields["title"], position_id):
            raise HttpError(409, "A position with that title already exists")
        if new_wage_details:
            latest_released_period_end = one(connection, "SELECT MAX(end_date) AS latest_released_period_end FROM pay_period WHERE status = 'RELEASED'")["latest_released_period_end"]
            if latest_released_period_end and new_wage_details[1] <= latest_released_period_end:
                raise HttpError(400, f"effectiveFrom must be after {latest_released_period_end}, the end of the latest released pay period")
            previous_wage = one(connection, "SELECT hourly_wage FROM position_wage WHERE position_id = %s AND effective_from = %s",
                                 (position_id, new_wage_details[1]))
            query(connection, """INSERT INTO position_wage (position_id, hourly_wage, effective_from, created_by) VALUES (%s, %s, %s, %s)
                           ON CONFLICT (position_id, effective_from) DO UPDATE SET hourly_wage = EXCLUDED.hourly_wage,
                                                                                    created_by = EXCLUDED.created_by, created_at = now()""",
                  (position_id, new_wage_details[0], new_wage_details[1], request_context["employee_id"]))
            audit(connection, request_context, "position_wage", f"{position_id}:{new_wage_details[1]}",
                  "UPDATE" if previous_wage else "INSERT",
                  {"hourly_wage": previous_wage["hourly_wage"]} if previous_wage else None,
                  {"hourly_wage": new_wage_details[0], "effective_from": new_wage_details[1]})
        if changed_position_fields:
            changed_column_names = list(changed_position_fields)
            update_assignments = ", ".join(column_name + " = %s" for column_name in changed_column_names)
            query(connection, f"UPDATE position SET {update_assignments} WHERE position_id = %s",
                  [changed_position_fields[column_name] for column_name in changed_column_names] + [position_id])
            audit(connection, request_context, "position", position_id, "UPDATE",
                  {column_name: old_position[column_name] for column_name in changed_column_names},
                  changed_position_fields)
        if deleting_position:
            query(connection, "UPDATE position SET is_deleted = true WHERE position_id = %s", (position_id,))
            audit(connection, request_context, "position", position_id, "DELETE", {"is_deleted": False}, {"is_deleted": True})
            return no_content()
        return position_json(connection, position_id)
    
    
# ---- stat holidays ------------------------------------------------------------------------------------------

def list_stat_holidays(event, request_context):
    """GET /stat-holidays?year=  - any signed-in role, so the timesheet can colour the dates."""
    year = opt_int(qs(event).get("year"), "year") or payroll.today_bc().year
    if year < 2000 or year > 2100:
        bad("year must be between 2000 and 2100")
    holiday_rows = query(
        get_conn(),
        """
        SELECT holiday_date, name
        FROM stat_holiday
        WHERE holiday_date BETWEEN %s AND %s
        ORDER BY holiday_date
        """,
        (datetime.date(year, 1, 1), datetime.date(year, 12, 31))
    )
    return {
        "year": year,
        "holidays": [
            {"date": holiday_row["holiday_date"], "name": holiday_row["name"]}
            for holiday_row in holiday_rows
        ]
    }
    
    
def assert_date_not_released(connection, holiday_date):
    """A stat holiday inside a released pay period can no longer be added or removed."""
    released_period = one(
        connection,
        """
        SELECT 1 AS period_exists
        FROM pay_period
        WHERE %s::date BETWEEN start_date AND end_date
          AND status = 'RELEASED'
        """,
        (holiday_date,)
    )

    if released_period:
        raise HttpError(409, "That date is inside a pay period that has already been released")
    
    
def add_stat_holiday(event, request_context):
    """POST /pa/stat-holidays  body {date, name}"""
    request_body = parse_body(event)
    holiday_date = require_date(request_body.get("date"), "date")
    name = require_str(request_body.get("name"), "name", 100)

    with transaction() as connection:
        assert_date_not_released(connection, holiday_date)

        if one(connection, "SELECT 1 AS holiday_exists FROM stat_holiday WHERE holiday_date = %s", (holiday_date,)):
            raise HttpError(409, "That date is already a stat holiday")

        query(
            connection,
            "INSERT INTO stat_holiday (holiday_date, name, created_by) VALUES (%s, %s, %s)",
            (holiday_date, name, request_context["employee_id"])
        )

        audit(
            connection,
            request_context,
            "stat_holiday",
            holiday_date.isoformat(),
            "INSERT",
            None,
            {"holiday_date": holiday_date, "name": name, "created_by": request_context["employee_id"]}
        )

    return created({"date": holiday_date, "name": name})


def delete_stat_holiday(event, request_context):
    """DELETE /pa/stat-holidays/{date}"""
    holiday_date = require_date((event.get("pathParameters") or {}).get("date"), "date")

    with transaction() as connection:
        old_holiday = one(
            connection,
            "SELECT holiday_date, name FROM stat_holiday WHERE holiday_date = %s FOR UPDATE",
            (holiday_date,)
        )

        if not old_holiday:
            raise HttpError(404, "That date is not a stat holiday")

        assert_date_not_released(connection, holiday_date)

        query(connection, "DELETE FROM stat_holiday WHERE holiday_date = %s", (holiday_date,))

        audit(
            connection,
            request_context,
            "stat_holiday",
            holiday_date.isoformat(),
            "DELETE",
            {"holiday_date": old_holiday["holiday_date"], "name": old_holiday["name"]},
            None
        )

    return no_content()


lambda_handler = router({
    "GET /pa/pay-periods": with_auth(PAYROLL_ADMIN_ROLES, list_periods),
    "PATCH /pa/payroll/{id}/release": with_auth(PAYROLL_ADMIN_ROLES, release),
    "GET /pa/positions": with_auth(PAYROLL_ADMIN_ROLES, list_positions),
    "POST /pa/positions": with_auth(PAYROLL_ADMIN_ROLES, create_position),
    "PATCH /pa/positions/{id}": with_auth(PAYROLL_ADMIN_ROLES, update_position),
    "GET /stat-holidays": with_auth([], list_stat_holidays),
    "POST /pa/stat-holidays": with_auth(PAYROLL_ADMIN_ROLES, add_stat_holiday),
    "DELETE /pa/stat-holidays/{date}": with_auth(PAYROLL_ADMIN_ROLES, delete_stat_holiday),
})