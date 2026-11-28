import datetime
import json
import os

import boto3

from payroll_common import payroll as pr
from payroll_common.db import get_conn, query
from payroll_common.validate import one_of

DAY = datetime.timedelta(days=1)

RECIPIENTS = {
    "EMPLOYEE": """SELECT e.first_name, e.last_name, e.email FROM employee e
                    WHERE e.status = 'ACTIVE' ORDER BY e.employee_id""",
    "MANAGER": """SELECT e.first_name, e.last_name, e.email FROM employee e JOIN role r ON r.role_id = e.role_id
                   WHERE e.status = 'ACTIVE' AND r.name = 'MANAGER' ORDER BY e.employee_id""",
    "PAYROLL_ADMIN": """SELECT e.first_name, e.last_name, e.email FROM employee e JOIN role r ON r.role_id = e.role_id
                         WHERE e.status = 'ACTIVE' AND r.name = 'PAYROLL_ADMIN' ORDER BY e.employee_id""",
}
DAYS_AFTER_PERIOD_END = {"MANAGER": 2, "PAYROLL_ADMIN": 3}

_sns = None


def sns():
    global _sns
    if _sns is None:
        _sns = boto3.client("sns")
    return _sns


def pick_period(conn, role, today):
    current = pr.period_containing(conn, today)
    if role == "EMPLOYEE":
        return current, current is not None and current["end_date"] == today + DAY
    previous = pr.period_containing(conn, current["start_date"] - DAY) if current else None
    due = previous is not None and (today - previous["end_date"]).days == DAYS_AFTER_PERIOD_END[role]
    return previous, due


def publish(messages):
    topic = os.environ["REMINDER_TOPIC_ARN"]
    for i in range(0, len(messages), 10):
        chunk = messages[i:i + 10]
        res = sns().publish_batch(TopicArn=topic, PublishBatchRequestEntries=[
            {"Id": str(n), "Message": json.dumps(m)} for n, m in enumerate(chunk)])
        if res.get("Failed"):
            raise RuntimeError(f"SNS refused {len(res['Failed'])} of {len(chunk)} reminders: {res['Failed'][0].get('Message')}")


def lambda_handler(event, context=None):
    event = event or {}
    role = one_of(event.get("role"), "role", list(RECIPIENTS))
    scheduled = event.get("scheduled") is True
    conn = get_conn()
    today = pr.today_bc()
    period, due = pick_period(conn, role, today)
    if scheduled and not due:
        conn.rollback()
        return {"sent": 0, "role": role, "skipped": "Today is not a reminder day for this pay period"}
    people = query(conn, RECIPIENTS[role])
    conn.rollback()
    when = {"periodStart": period["start_date"].isoformat(), "periodEnd": period["end_date"].isoformat(),
            "payDate": period["pay_date"].isoformat()} if period else {}
    publish([{"role": role, "name": f"{p['first_name']} {p['last_name']}", "firstName": p["first_name"], "email": p["email"], **when}
             for p in people])
    return {"sent": len(people), "role": role, "periodStart": when.get("periodStart"), "periodEnd": when.get("periodEnd")}
