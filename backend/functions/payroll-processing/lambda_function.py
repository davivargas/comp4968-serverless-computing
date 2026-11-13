"""Payroll release (pay-period level) and position / wage administration (Payroll Admin)."""
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from payroll_common import payroll as payroll
from payroll_common.audit import audit
from payroll_common.auth import with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, created, no_content, parse_body, router, qs
from payroll_common.validate import bad, path_id, require_bool_true, require_date, require_str


PAYROLL_ADMIN_ROLES = ["PAYROLL_ADMIN"]

# ---- pay periods ---------------------------------------------------------------------------------------------

def list_periods(event, request_context):
    """GET /pa/pay-periods?limit=&offset=  - canRelease drives the Release button."""
    today = payroll.today_bc()
    limit, offset = payroll.paging(qs(event), 26, 100)
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
    
    
def validate_pay_period(connection, pay_period_id):
    """Validate that a pay period exists and is eligible for release."""

    pay_period = one(
        connection,
        "SELECT * FROM pay_period WHERE pay_period_id = %s FOR UPDATE",
        (pay_period_id,)
    )

    if not pay_period:
        raise HttpError(404, "Pay period not found")

    if pay_period["status"] == "RELEASED":
        raise HttpError(409, "This pay period has already been released")

    if payroll.today_bc() <= pay_period["end_date"]:
        raise HttpError(409, "This pay period has not ended yet")

    return pay_period


def validate_timesheets(connection, pay_period):
    """Ensure all timesheet entries in the pay period are approved."""

    unapproved_count = one(
        connection,
        """
        SELECT COUNT(*)::int AS unapproved_count
        FROM timesheet_entry
        WHERE NOT is_deleted
          AND work_date BETWEEN %s AND %s
          AND NOT approved
        """,
        (pay_period["start_date"], pay_period["end_date"])
    )["unapproved_count"]

    if unapproved_count:
        entry_word = "entry is" if unapproved_count == 1 else "entries are"

        raise HttpError(
            409,
            f"{unapproved_count} timesheet {entry_word} not approved yet",
            {"unapprovedCount": unapproved_count}
        )
        

def load_payroll_employees(connection, pay_period):
    employees = query(
        connection,
        """
        SELECT employee.employee_id,
               employee.first_name || ' ' || employee.last_name AS employee_name,
               employee.hire_date,
               employee.position_id,
               position.title,
               direct_deposit.account_last4
        FROM employee
        JOIN position ON position.position_id = employee.position_id
        LEFT JOIN direct_deposit ON direct_deposit.employee_id = employee.employee_id
        WHERE employee.employee_id IN (
            SELECT employee_id
            FROM timesheet_entry
            WHERE NOT is_deleted
              AND work_date BETWEEN %s AND %s
        )
        ORDER BY employee.employee_id
        """,
        (pay_period["start_date"], pay_period["end_date"])
    )

    if not employees:
        raise HttpError(
            409,
            "No timesheet entries in this pay period; nothing to release"
        )

    return employees


def load_and_validate_wages(connection, employees):
    wages_by_position_id = payroll.load_wages(
        connection,
        {employee["position_id"] for employee in employees}
    )

    for employee in employees:
        if not wages_by_position_id[employee["position_id"]]:
            raise HttpError(
                409,
                f'The position "{employee["title"]}" has no wage set; add one before releasing'
            )

    return wages_by_position_id

def load_employee_earnings(connection, pay_period):
    """Load and return daily work entries grouped by employee ID for the given pay period."""
    daily_work_entries = query(
        connection,
        """
        SELECT timesheet_entry.employee_id,
               timesheet_entry.work_date,
               project.project_id,
               project.project_code,
               (SUM(EXTRACT(EPOCH FROM (
                   timesheet_entry.end_time - timesheet_entry.start_time
               ))) / 60)::int AS minutes
        FROM timesheet_entry
        JOIN project
            ON project.project_id = timesheet_entry.project_id
        WHERE NOT timesheet_entry.is_deleted
          AND timesheet_entry.work_date BETWEEN %s AND %s
        GROUP BY timesheet_entry.employee_id,
                 timesheet_entry.work_date,
                 project.project_id,
                 project.project_code
        """,
        (pay_period["start_date"], pay_period["end_date"])
    )

    daily_entries_by_employee_id = defaultdict(list)

    for daily_entry in daily_work_entries:
        daily_entries_by_employee_id[
            daily_entry["employee_id"]
        ].append(daily_entry)

    return daily_entries_by_employee_id

def load_ytd_totals(connection, pay_period):
    """Load and return year-to-date totals for each employee up to the start of the given pay period."""
    payroll_year = pay_period["pay_date"].year

    year_to_date_rows = query(
        connection,
        """
        SELECT paystub.employee_id,
               SUM(regular_hours + overtime_hours + double_overtime_hours) AS total_hours,
               SUM(gross_pay) AS gross_pay,
               SUM(cpp) AS cpp,
               SUM(ei) AS ei,
               SUM(federal_tax) AS federal_tax,
               SUM(provincial_tax) AS provincial_tax,
               SUM(net_pay) AS net_pay
        FROM paystub
        JOIN pay_period
            ON pay_period.pay_period_id = paystub.pay_period_id
        WHERE pay_period.start_date < %s
          AND EXTRACT(YEAR FROM pay_period.pay_date) = %s
        GROUP BY paystub.employee_id
        """,
        (pay_period["start_date"], payroll_year)
    )

    return {
        row["employee_id"]: row
        for row in year_to_date_rows
    }
    
    
def create_employee_paystub(
    connection,
    request_context,
    pay_period,
    employee,
    wages_by_position_id,
    daily_entries_by_employee_id,
    year_to_date_by_employee_id,
    payroll_rates
):
    """Create a paystub for the given employee and pay period."""
    employee_id = employee["employee_id"]

    employee_year_to_date = year_to_date_by_employee_id.get(
        employee_id, {}
    )

    year_to_date_totals = {
        "hours": employee_year_to_date.get("total_hours") or 0,
        "gross": employee_year_to_date.get("gross_pay") or 0,
        "cpp": employee_year_to_date.get("cpp") or 0,
        "ei": employee_year_to_date.get("ei") or 0,
        "federal": employee_year_to_date.get("federal_tax") or 0,
        "provincial": employee_year_to_date.get("provincial_tax") or 0,
        "net": employee_year_to_date.get("net_pay") or 0,
    }

    earning_entries = [
        {
            "date": daily_entry["work_date"],
            "project_id": daily_entry["project_id"],
            "project_code": daily_entry["project_code"],
            "minutes": daily_entry["minutes"],
            "rate": payroll.wage_for(
                wages_by_position_id[employee["position_id"]],
                daily_entry["work_date"]
            )
        }
        for daily_entry in daily_entries_by_employee_id[employee_id]
    ]

    paystub_calculation = payroll.calculate_paystub(
        earning_entries,
        pay_period["start_date"],
        payroll.vacation_rate_for(
            employee["hire_date"],
            pay_period["end_date"]
        ),
        year_to_date_totals,
        payroll_rates
    )

    earning_lines = paystub_calculation.pop("earnings")

    paystub_row = {
        "employee_id": employee_id,
        "pay_period_id": pay_period["pay_period_id"],
        "employee_name": employee["employee_name"],
        "position_title": employee["title"],
        "deposit_account_last4": employee["account_last4"],
        **paystub_calculation
    }

    column_names = list(paystub_row)

    inserted_paystub = one(
        connection,
        f"""
        INSERT INTO paystub ({', '.join(column_names)})
        VALUES ({', '.join(['%s'] * len(column_names))})
        RETURNING paystub_id
        """,
        [paystub_row[column_name] for column_name in column_names]
    )

    for earning_line in earning_lines:
        query(
            connection,
            """
            INSERT INTO paystub_earning
                (paystub_id, line_type, project_id,
                 project_code, hours, rate, amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                inserted_paystub["paystub_id"],
                earning_line["line_type"],
                earning_line["project_id"],
                earning_line["project_code"],
                earning_line["hours"],
                earning_line["rate"],
                earning_line["amount"]
            )
        )

    audit(
        connection,
        request_context,
        "paystub",
        inserted_paystub["paystub_id"],
        "INSERT",
        None,
        paystub_row
    )

    return {
        "paystubId": inserted_paystub["paystub_id"],
        "employeeId": employee_id,
        "gross": paystub_calculation["gross_pay"],
        "net": paystub_calculation["net_pay"]
    }
    
def finalize_payroll_release(
    connection,
    pay_period_id,
    request_context
):
    """Finalize the release of the payroll for the given pay period."""
    query(
        connection,
        """
        UPDATE pay_period
        SET status = 'RELEASED',
            released_by = %s,
            released_at = now()
        WHERE pay_period_id = %s
        """,
        (request_context["employee_id"], pay_period_id)
    )

    audit(
        connection,
        request_context,
        "pay_period",
        pay_period_id,
        "UPDATE",
        {"status": "OPEN"},
        {
            "status": "RELEASED",
            "released_by": request_context["employee_id"]
        }
    )
    
    
def generate_paystubs(
    connection,
    request_context,
    pay_period,
    employees,
    wages_by_position_id,
    daily_entries_by_employee_id,
    year_to_date_by_employee_id
):
    """Generate paystubs for all employees for the given pay period."""
    payroll_year = pay_period["pay_date"].year
    payroll_rates = payroll.rates_for(payroll_year)

    created_paystubs = []

    for employee in employees:
        paystub = create_employee_paystub(
            connection,
            request_context,
            pay_period,
            employee,
            wages_by_position_id,
            daily_entries_by_employee_id,
            year_to_date_by_employee_id,
            payroll_rates
        )

        created_paystubs.append(paystub)

    return created_paystubs

def release(event, request_context):
    """PATCH /pa/payroll/{id}/release"""

    pay_period_id = path_id(event)

    with transaction() as connection:
        pay_period = validate_pay_period(
            connection, pay_period_id
        )

        validate_timesheets(connection, pay_period)

        employees, wages_by_position_id = load_payroll_employees(
            connection, pay_period
        )

        daily_entries_by_employee_id = load_employee_earnings(
            connection, pay_period
        )

        year_to_date_by_employee_id = load_ytd_totals(
            connection, pay_period
        )

        created_paystubs = generate_paystubs(
            connection,
            request_context,
            pay_period,
            employees,
            wages_by_position_id,
            daily_entries_by_employee_id,
            year_to_date_by_employee_id
        )

        finalize_payroll_release(
            connection,
            pay_period_id,
            request_context
        )

    return {
        "payPeriodId": pay_period_id,
        "status": "RELEASED",
        "paystubsCreated": len(created_paystubs),
        "paystubs": created_paystubs
    }
        
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


lambda_handler = router({
    "GET /pa/pay-periods": with_auth(PAYROLL_ADMIN_ROLES, list_periods),
    "GET /pa/positions": with_auth(PAYROLL_ADMIN_ROLES, list_positions),
    "POST /pa/positions": with_auth(PAYROLL_ADMIN_ROLES, create_position),
    "PATCH /pa/positions/{id}": with_auth(PAYROLL_ADMIN_ROLES, update_position),
})