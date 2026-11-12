ENTRY_SELECT = """SELECT t.timesheet_id, t.employee_id, t.work_date, t.start_time, t.end_time, p.project_code, p.name AS project_name,
                         t.submitted, t.approved
                    FROM timesheet_entry t JOIN project p ON p.project_id = t.project_id"""


def entry_json(r):
    return {"timesheetId": r["timesheet_id"], "employeeId": r["employee_id"], "date": r["work_date"],
            "startTime": r["start_time"], "endTime": r["end_time"], "projectCode": r["project_code"],
            "submitted": r["submitted"], "approved": r["approved"]}
