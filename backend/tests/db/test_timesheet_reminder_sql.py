import datetime
import json

import pytest

from helpers.lambdas import load_lambda
from helpers.pg import insert
from payroll_common import payroll
from payroll_common.http_utils import HttpError

"""Tests for the timesheet-reminder Lambda on a real Postgres: who gets a
reminder, and on which day of a pay period.

Approach: the Lambda runs unchanged against the base fixture company
(Ivy IT, Mei manager, Ana developer) plus a Payroll Admin, a deactivated
employee and an auditor; only SNS is faked, and "today" is pinned.
Pay periods run Sunday to Saturday: Nov 8 to Nov 21, 2026 is one, with
Friday Nov 20 the day before it ends.
"""

reminder = load_lambda("timesheet-reminder")

FRIDAY, MONDAY, TUESDAY = (datetime.date(2026, 11, d) for d in (20, 23, 24))
FIRST_WEEK_FRIDAY, FIRST_WEEK_MONDAY = datetime.date(2026, 11, 13), datetime.date(2026, 11, 16)
PERIOD = {"periodStart": "2026-11-08", "periodEnd": "2026-11-21", "payDate": "2026-11-27"}


class FakeSns:
    """Records publish_batch calls; set refuse to make SNS reject entries."""

    def __init__(self):
        self.batches, self.refuse = [], False

    def publish_batch(self, TopicArn, PublishBatchRequestEntries):
        self.batches.append((TopicArn, PublishBatchRequestEntries))
        if self.refuse:
            return {"Successful": [], "Failed": [{"Id": "0", "Message": "denied"}]}
        return {"Successful": [{"Id": e["Id"]} for e in PublishBatchRequestEntries], "Failed": []}

    def messages(self):
        return [json.loads(e["Message"]) for _, entries in self.batches for e in entries]


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    """Fake SNS and a topic ARN."""
    fake = FakeSns()
    monkeypatch.setattr(reminder, "_sns", fake)
    monkeypatch.setenv("REMINDER_TOPIC_ARN", "arn:aws:sns:us-west-2:1:topic")
    return fake


@pytest.fixture
def company(conn, base):
    """The base company plus Pat (Payroll Admin), Dee (deactivated) and Zed (an auditor)."""
    def person(first, role_id=None, status="ACTIVE"):
        return insert(conn, "employee", cognito_sub=f"sub-{first.lower()}", first_name=first, last_name="Test",
                      email=f"{first.lower()}@test.com", role_id=role_id, position_id=base.dev_position,
                      status=status, hire_date=datetime.date(2020, 1, 1))
    person("Pat", role_id=2)
    person("Dee", status="DEACTIVATED")
    insert(conn, "auditor", cognito_sub="sub-zed", first_name="Zed", last_name="Quinn", email="zed@test.com",
           created_by=base.admin)
    conn.commit()
    return base


def today(monkeypatch, day):
    monkeypatch.setattr(payroll, "today_bc", lambda: day)


def run(role, scheduled=True):
    return reminder.lambda_handler({"role": role, "scheduled": scheduled})


def sent_to(setup):
    return sorted(m["email"] for m in setup.messages())


@pytest.mark.parametrize("role, day, expected", [
    ("EMPLOYEE", FRIDAY, ["ana@test.com", "ivy@test.com", "mei@test.com", "pat@test.com"]),
    ("MANAGER", MONDAY, ["mei@test.com"]),
    ("PAYROLL_ADMIN", TUESDAY, ["pat@test.com"]),
])
def test_scheduled_reminder_goes_to_the_active_people_of_that_role(company, setup, monkeypatch, role, day, expected):
    """Everyone active gets the Friday one (managers, admins and IT are
    employees too); only managers get Monday's; only Payroll Admins
    Tuesday's. Deactivated people and auditors are never included."""
    today(monkeypatch, day)
    result = run(role)
    assert sent_to(setup) == expected
    assert result["sent"] == len(expected) and result["role"] == role


def test_the_message_names_the_person_and_the_period(company, setup, monkeypatch):
    """One SNS message per person with what the email needs. The period
    is the current one on Friday and the one that just ended on Monday."""
    today(monkeypatch, FRIDAY)
    run("EMPLOYEE")
    [ana] = [m for m in setup.messages() if m["email"] == "ana@test.com"]
    assert ana == {"role": "EMPLOYEE", "name": "Ana Test", "firstName": "Ana", "email": "ana@test.com", **PERIOD}
    assert setup.batches[0][0] == "arn:aws:sns:us-west-2:1:topic"
    setup.batches.clear()
    today(monkeypatch, MONDAY)
    run("MANAGER")
    assert {k: setup.messages()[0][k] for k in PERIOD} == PERIOD


@pytest.mark.parametrize("role, day", [
    ("EMPLOYEE", FIRST_WEEK_FRIDAY), ("EMPLOYEE", MONDAY), ("EMPLOYEE", datetime.date(2026, 11, 21)),
    ("MANAGER", FIRST_WEEK_MONDAY), ("MANAGER", FRIDAY), ("MANAGER", TUESDAY),
    ("PAYROLL_ADMIN", FIRST_WEEK_FRIDAY), ("PAYROLL_ADMIN", MONDAY), ("PAYROLL_ADMIN", datetime.date(2026, 12, 1)),
])
def test_scheduled_reminder_does_nothing_on_the_wrong_day(company, setup, monkeypatch, role, day):
    """The schedules fire every week, but only the Friday before a period
    ends, the Monday after, and the Tuesday after that send anything."""
    today(monkeypatch, day)
    result = run(role)
    assert result["sent"] == 0 and "not a reminder day" in result["skipped"]
    assert setup.batches == []


def test_the_next_period_has_its_own_reminder_days(company, setup, monkeypatch):
    """Two weeks later the same days are due again, for the next period."""
    today(monkeypatch, datetime.date(2026, 12, 4))
    run("EMPLOYEE")
    assert setup.messages()[0]["periodEnd"] == "2026-12-05"


@pytest.mark.parametrize("day", [FIRST_WEEK_FRIDAY, FRIDAY, MONDAY])
def test_a_manual_run_always_sends(company, setup, monkeypatch, day):
    """Without "scheduled": true (an invoke by hand) the day check is
    skipped, so the reminder can be shown in a demo on any day."""
    today(monkeypatch, day)
    assert run("EMPLOYEE", scheduled=False)["sent"] == 4
    assert run("MANAGER", scheduled=False)["sent"] == 1


def test_a_manual_manager_reminder_is_about_the_period_that_just_ended(company, setup, monkeypatch):
    """Managers and Payroll Admins act on the finished period, so a manual
    run mid-period still names the last finished one."""
    today(monkeypatch, FIRST_WEEK_FRIDAY)
    run("MANAGER", scheduled=False)
    assert setup.messages()[0]["periodEnd"] == "2026-11-07"


def test_a_manual_run_before_the_first_pay_period_has_no_dates(company, setup, monkeypatch):
    """With no pay period yet the email is still sent, just without dates."""
    monkeypatch.setenv("PAY_PERIOD_ANCHOR", "2030-01-06")
    today(monkeypatch, FRIDAY)
    assert run("EMPLOYEE", scheduled=False)["sent"] == 4
    assert "periodStart" not in setup.messages()[0]
    assert run("EMPLOYEE")["sent"] == 0


def test_messages_are_published_ten_at_a_time(conn, company, setup, monkeypatch):
    """SNS takes at most 10 per batch: 24 active people make 3 batches."""
    for i in range(20):
        insert(conn, "employee", cognito_sub=f"sub-x{i}", first_name=f"X{i}", last_name="Test", email=f"x{i}@test.com",
               position_id=company.dev_position, hire_date=datetime.date(2020, 1, 1))
    conn.commit()
    today(monkeypatch, FRIDAY)
    run("EMPLOYEE")
    assert [len(entries) for _, entries in setup.batches] == [10, 10, 4]
    assert len({m["email"] for m in setup.messages()}) == 24


def test_a_refused_publish_fails_the_run(company, setup, monkeypatch):
    """If SNS refuses messages the invoke fails loudly instead of
    reporting success."""
    setup.refuse = True
    today(monkeypatch, FRIDAY)
    with pytest.raises(RuntimeError, match="SNS refused 1 of 4"):
        run("EMPLOYEE")


@pytest.mark.parametrize("event", [None, {}, {"role": "CEO"}, {"role": "employee"}])
def test_unknown_role_is_rejected(company, setup, event):
    """Only the three roles are accepted, before any message is sent."""
    with pytest.raises(HttpError) as err:
        reminder.lambda_handler(event)
    assert err.value.status == 400 and setup.batches == []


def test_no_one_to_remind_publishes_nothing(conn, company, setup, monkeypatch):
    """With no active Payroll Admin there is nothing to publish."""
    conn.cursor().execute("UPDATE employee SET status = 'DEACTIVATED' WHERE role_id = 2")
    conn.commit()
    today(monkeypatch, TUESDAY)
    assert run("PAYROLL_ADMIN")["sent"] == 0 and setup.batches == []


def test_sns_client_is_created_once(monkeypatch):
    """The boto3 client is built on first use, then reused."""
    made = []
    monkeypatch.setattr(reminder, "_sns", None)
    monkeypatch.setattr(reminder.boto3, "client", lambda name: made.append(name) or object())
    assert reminder.sns() is reminder.sns()
    assert made == ["sns"]
