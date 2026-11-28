import datetime
import json
import os

import boto3

_ses = None

TEXT = {
    "EMPLOYEE": ("Reminder: submit your timesheet by the end of Saturday",
                 "Please submit your timesheet for the pay period {period} by the end of the day on Saturday."),
    "MANAGER": ("Reminder: approve your team's timesheets by the end of Monday",
                "Please approve your team's timesheets for the pay period {period} by the end of the day on Monday."),
    "PAYROLL_ADMIN": ("Reminder: release the pay by the end of Tuesday",
                      "Please release the pay for the pay period {period}{pay_date} by the end of the day on Tuesday."),
}


def ses():
    global _ses
    if _ses is None:
        _ses = boto3.client("sesv2")
    return _ses


def day(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d:%b} {d.day}"


def compose(msg):
    subject, body = TEXT[msg["role"]]
    period = f"{day(msg['periodStart'])} to {day(msg['periodEnd'])}, {msg['periodEnd'][:4]}" if msg.get("periodStart") else "that is ending"
    pay_date = f" (pay date {day(msg['payDate'])})" if msg.get("payDate") else ""
    text = f"Hi {msg['firstName']},\n\n{body.format(period=period, pay_date=pay_date)}\n\nThis reminder is from Timely."
    return subject, text


def send(msg):
    sender = os.environ["SENDER_EMAIL"]
    to = os.environ.get("REDIRECT_TO") or msg["email"]
    subject, text = compose(msg)
    if to != msg["email"]:
        subject = f"[for {msg['email']}] {subject}"
        text = f"(Demo: this reminder is for {msg['name']} <{msg['email']}> and was redirected to this inbox.)\n\n{text}"
    res = ses().send_email(FromEmailAddress=sender, Destination={"ToAddresses": [to]},
                           Content={"Simple": {"Subject": {"Data": subject, "Charset": "UTF-8"},
                                               "Body": {"Text": {"Data": text, "Charset": "UTF-8"}}}})
    print(json.dumps({"event": "reminder_sent", "role": msg["role"], "for": msg["email"], "to": to, "sesMessageId": res.get("MessageId")}))


def lambda_handler(event, context=None):
    failures = []
    for record in event.get("Records", []):
        try:
            send(json.loads(record["body"]))
        except Exception as e:
            print(json.dumps({"event": "reminder_failed", "messageId": record["messageId"], "error": str(e)}))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
