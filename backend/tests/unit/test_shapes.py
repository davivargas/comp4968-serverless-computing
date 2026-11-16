import datetime
import re

from payroll_common.payroll import calculate_paystub, rates_for
from payroll_common.shapes import PAID_HOURS_SQL, entry_json

"""Unit tests for payroll_common.shapes, the SQL snippets and row-to-JSON
helpers shared between Lambdas.

Approach: entry_json is checked field by field, and PAID_HOURS_SQL is
checked against the hour fields calculate_paystub actually produces.
"""

ROW = {"timesheet_id": 3, "employee_id": 7,
       "work_date": datetime.date(2026, 1, 5),
       "start_time": datetime.time(9, 0), "end_time": datetime.time(17, 0),
       "project_code": 1001, "project_name": "Payroll",
       "submitted": True, "approved": False}
YTD_FIELDS = ("hours", "gross", "cpp", "ei", "federal", "provincial", "net")


def test_entry_json_uses_api_field_names():
    """Rows become the camelCase fields the frontend reads; work_date is
    exposed as date, and project_name is left out."""
    assert entry_json(ROW) == {
        "timesheetId": 3, "employeeId": 7,
        "date": datetime.date(2026, 1, 5),
        "startTime": datetime.time(9, 0), "endTime": datetime.time(17, 0),
        "projectCode": 1001, "submitted": True, "approved": False,
    }


def test_paid_hours_sql_covers_every_paid_hour_column():
    """Paid hours must sum every hour column a paystub stores except
    vacation leave, which is reported but not paid as hours."""
    work = {"date": datetime.date(2026, 1, 5), "minutes": 60, "kind": "WORK",
            "rate": 25, "project_id": 1, "project_code": 1001}
    ytd = dict.fromkeys(YTD_FIELDS, 0)
    stub = calculate_paystub([work], datetime.date(2026, 1, 4), 0, ytd,
                             rates_for(2026))
    paid = {key for key in stub if key.endswith("_hours")}
    paid -= {"ytd_hours", "vacation_leave_hours"}
    assert set(re.findall(r"ps\.(\w+)", PAID_HOURS_SQL)) == paid
