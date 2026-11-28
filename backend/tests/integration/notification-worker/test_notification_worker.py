import json

import pytest

from helpers.events import sqs_event
from helpers.lambdas import load_lambda

"""Tests for the notification-worker Lambda: turns reminder messages
from the SQS queue into emails sent through Amazon SES.

Approach: the handler runs unchanged on SQS events; the SES client is a
fake that records every email, so tests check who it was sent from and
to, the wording, and which messages are reported back as failed.
"""

worker = load_lambda("notification-worker")

SENDER = "group1.timely.demo@gmail.com"
PERIOD = {"periodStart": "2026-11-08", "periodEnd": "2026-11-21", "payDate": "2026-11-27"}
KAI = {"role": "EMPLOYEE", "name": "Kai Ito", "firstName": "Kai", "email": "kai.ito@test.com", **PERIOD}


class FakeSes:
    """Records send_email calls; set fail_for to an address to make it fail."""

    def __init__(self):
        self.sent, self.fail_for = [], None

    def send_email(self, **kwargs):
        if kwargs["Destination"]["ToAddresses"] == [self.fail_for]:
            raise RuntimeError("Email address is not verified")
        self.sent.append(kwargs)
        return {"MessageId": f"ses-{len(self.sent)}"}

    def subject(self, i=0):
        return self.sent[i]["Content"]["Simple"]["Subject"]["Data"]

    def body(self, i=0):
        return self.sent[i]["Content"]["Simple"]["Body"]["Text"]["Data"]


@pytest.fixture(autouse=True)
def ses(monkeypatch):
    """Fake SES, a verified sender, and the demo redirect address."""
    fake = FakeSes()
    monkeypatch.setattr(worker, "_ses", fake)
    monkeypatch.setenv("SENDER_EMAIL", SENDER)
    monkeypatch.setenv("REDIRECT_TO", SENDER)
    return fake


def test_reminder_is_sent_from_and_to_the_demo_inbox(ses):
    """With a redirect address set, the email goes there and the subject
    and first line say who it was really for."""
    result = worker.lambda_handler(sqs_event(KAI))
    assert result == {"batchItemFailures": []}
    [mail] = ses.sent
    assert mail["FromEmailAddress"] == SENDER and mail["Destination"] == {"ToAddresses": [SENDER]}
    assert ses.subject() == "[for kai.ito@test.com] Reminder: submit your timesheet by the end of Saturday"
    assert "for Kai Ito <kai.ito@test.com> and was redirected" in ses.body()


def test_without_a_redirect_the_email_goes_to_the_person(ses, monkeypatch):
    """With REDIRECT_TO empty each reminder goes to the person's own
    address, with a plain subject."""
    monkeypatch.setenv("REDIRECT_TO", "")
    worker.lambda_handler(sqs_event(KAI))
    assert ses.sent[0]["Destination"] == {"ToAddresses": ["kai.ito@test.com"]}
    assert ses.subject() == "Reminder: submit your timesheet by the end of Saturday"
    assert "redirected" not in ses.body()


@pytest.mark.parametrize("role, subject, wording", [
    ("EMPLOYEE", "submit your timesheet by the end of Saturday", "submit your timesheet for the pay period Nov 8 to Nov 21, 2026 by the end of the day on Saturday"),
    ("MANAGER", "approve your team's timesheets by the end of Monday", "approve your team's timesheets for the pay period Nov 8 to Nov 21, 2026 by the end of the day on Monday"),
    ("PAYROLL_ADMIN", "release the pay by the end of Tuesday", "release the pay for the pay period Nov 8 to Nov 21, 2026 (pay date Nov 27) by the end of the day on Tuesday"),
])
def test_each_role_gets_its_own_wording(ses, role, subject, wording):
    """Employees are asked to submit, managers to approve, Payroll Admins
    to release, each with the pay period (and pay date for admins)."""
    worker.lambda_handler(sqs_event({**KAI, "role": role}))
    assert subject in ses.subject() and wording in ses.body()
    assert "Hi Kai,\n\nPlease " in ses.body()


def test_reminder_without_period_dates_still_reads_well(ses):
    """A message with no dates (sent before the first pay period) is
    still a complete sentence."""
    worker.lambda_handler(sqs_event({"role": "EMPLOYEE", "name": "Kai Ito", "firstName": "Kai", "email": "kai.ito@test.com"}))
    assert "for the pay period that is ending by the end" in ses.body()


def test_a_batch_sends_every_message(ses):
    """Each record becomes one email, in order."""
    worker.lambda_handler(sqs_event(KAI, {**KAI, "email": "ana@test.com", "firstName": "Ana", "name": "Ana Lee"}))
    assert [m["Destination"]["ToAddresses"] for m in ses.sent] == [[SENDER], [SENDER]]
    assert ses.subject(1).startswith("[for ana@test.com]")


def test_one_failure_is_reported_alone(ses, monkeypatch, capsys):
    """A message SES refuses is returned as a failed item (so SQS retries
    just that one); the others are still sent. With no redirect so the
    failing address is the person's own."""
    monkeypatch.setenv("REDIRECT_TO", "")
    ses.fail_for = "bad@test.com"
    result = worker.lambda_handler(sqs_event(KAI, {**KAI, "email": "bad@test.com"}, {**KAI, "email": "ana@test.com"}))
    assert result == {"batchItemFailures": [{"itemIdentifier": "msg-1"}]}
    assert [m["Destination"]["ToAddresses"][0] for m in ses.sent] == ["kai.ito@test.com", "ana@test.com"]
    assert "reminder_failed" in capsys.readouterr().out


@pytest.mark.parametrize("body", ["not json", json.dumps({"role": "CEO", "firstName": "X", "email": "x@test.com"}),
                                  json.dumps({"role": "EMPLOYEE"})])
def test_a_broken_message_is_a_failed_item_not_a_crash(ses, body):
    """Unreadable or incomplete messages go back to the queue (and to the
    dead-letter queue after five tries) instead of failing the batch."""
    result = worker.lambda_handler(sqs_event(body))
    assert result == {"batchItemFailures": [{"itemIdentifier": "msg-0"}]} and ses.sent == []


def test_every_send_is_logged(ses, capsys):
    """Each email leaves one JSON log line, so sends can be shown in
    CloudWatch."""
    worker.lambda_handler(sqs_event(KAI))
    line = json.loads(capsys.readouterr().out.strip())
    assert line == {"event": "reminder_sent", "role": "EMPLOYEE", "for": "kai.ito@test.com", "to": SENDER, "sesMessageId": "ses-1"}


def test_no_records_is_fine(ses):
    """An empty event does nothing."""
    assert worker.lambda_handler({}) == {"batchItemFailures": []}


def test_ses_client_is_created_once(monkeypatch):
    """The boto3 client is the SES v2 one, built on first use."""
    made = []
    monkeypatch.setattr(worker, "_ses", None)
    monkeypatch.setattr(worker.boto3, "client", lambda name: made.append(name) or object())
    assert worker.ses() is worker.ses()
    assert made == ["sesv2"]
