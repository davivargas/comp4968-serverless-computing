import base64
import datetime
import json

import pytest

from helpers.events import api_event
from helpers.lambdas import load_lambda
from payroll_common import auth

"""Tests for the audit-reader Lambda: GET /audit/logs for IT, Payroll
Admin and Auditor, and the Auditor's employee name lookup.

Approach: requests go through the Lambda's real router and role checks.
The sign-in lookup, the SQL for the name lookup and the DynamoDB table
are fakes that record what they were asked, so tests can check which
months and time range were queried (BC time is UTC-7 all year).
"""

reader = load_lambda("audit-reader")

TODAY = datetime.date(2026, 11, 25)
ITEM = {"auditId": "a1", "table": "employee", "recordId": "7", "action": "UPDATE",
        "changedBy": 1, "changedByName": "Ivy Tran", "changedAt": "2026-11-20T18:00:00.000000+00:00",
        "oldValues": json.dumps({"status": "ACTIVE"}), "newValues": json.dumps({"status": "DEACTIVATED"})}
ROW = {"employee_id": 1, "status": "ACTIVE", "first_name": "Ivy", "last_name": "Tran",
       "team_id": None, "role": "IT"}
AUDITOR_ROW = {"auditor_id": 4, "status": "ACTIVE", "first_name": "Zed", "last_name": "Quinn"}


class FakeTable:
    """Answers query() from a list of pages and records every call."""

    def __init__(self):
        self.pages, self.calls = [], []

    def query(self, **args):
        self.calls.append(args)
        return self.pages.pop(0) if self.pages else {"Items": []}

    def month(self, i=0):
        expression = self.calls[i]["KeyConditionExpression"].get_expression()["values"]
        return expression[0].get_expression()["values"][1]

    def bounds(self, i=0):
        between = self.calls[i]["KeyConditionExpression"].get_expression()["values"][1]
        _, low, high = between.get_expression()["values"]
        return low, high


@pytest.fixture
def caller(monkeypatch):
    """The signed-in user: Ivy, an IT employee, unless a test changes it."""
    state = {"employee": dict(ROW), "auditor": None}
    monkeypatch.setattr(auth, "get_conn", lambda: None)
    monkeypatch.setattr(auth, "one", lambda conn, sql, params: state["auditor"] if "FROM auditor" in sql else state["employee"])
    return state


@pytest.fixture
def auditor(caller):
    """The signed-in user is an auditor instead."""
    caller["employee"], caller["auditor"] = None, dict(AUDITOR_ROW)
    return caller


@pytest.fixture
def table(monkeypatch):
    fake = FakeTable()
    monkeypatch.setattr(reader, "table", lambda: fake)
    monkeypatch.setattr(reader, "today_bc", lambda: TODAY)
    return fake


@pytest.fixture
def sql(monkeypatch):
    """Records the name-lookup query and answers with chosen rows."""
    state = {"rows": [], "calls": []}
    monkeypatch.setattr(reader, "get_conn", lambda: "conn")
    monkeypatch.setattr(reader, "query", lambda conn, text, params: state["calls"].append((text, params)) or state["rows"])
    return state


def call(resource, role="IT", query=None):
    res = reader.lambda_handler(api_event("GET", resource, role=role, query=query))
    return res["statusCode"], json.loads(res["body"]) if res["body"] else None


# ---- access ----------------------------------------------------------

@pytest.mark.parametrize("role, row_role", [("IT", "IT"), ("PAYROLL_ADMIN", "PAYROLL_ADMIN")])
def test_it_and_payroll_admin_read_the_log(caller, table, role, row_role):
    """The two staff roles that could always read the log still can."""
    caller["employee"]["role"] = row_role
    assert call("/audit/logs", role=role)[0] == 200


def test_auditor_reads_the_log(auditor, table):
    """An auditor, with no employee row, can read the log."""
    status, body = call("/audit/logs", role="AUDITOR")
    assert status == 200 and body == {"logs": [], "nextToken": None}


@pytest.mark.parametrize("role", ["EMPLOYEE", "MANAGER"])
def test_employees_and_managers_cannot_read_the_log(caller, table, role):
    """Everyone else is a 403 before DynamoDB is touched."""
    caller["employee"]["role"] = "MANAGER" if role == "MANAGER" else None
    assert call("/audit/logs", role=role)[0] == 403
    assert table.calls == []


# ---- date range, in BC time ------------------------------------------

def test_default_range_is_the_last_90_days(auditor, table):
    """To defaults to today and from to 90 days earlier; both ends are
    BC midnights (07:00 UTC), and the end is the start of tomorrow."""
    call("/audit/logs", role="AUDITOR")
    low, high = table.bounds()
    assert low == "2026-08-27T07:00:00.000000+00:00"
    assert high == "2026-11-26T07:00:00.000000+00:00"
    assert table.month() == "2026-11"


def test_a_single_day_covers_midnight_to_midnight_in_bc(auditor, table):
    """The day 2026-11-10 runs from 07:00 UTC that day to 07:00 UTC the
    next, so evening events are not pushed onto the wrong date."""
    call("/audit/logs", role="AUDITOR", query={"from": "2026-11-10", "to": "2026-11-10"})
    assert table.bounds() == ("2026-11-10T07:00:00.000000+00:00", "2026-11-11T07:00:00.000000+00:00")


def test_summer_dates_use_the_same_offset(auditor, table):
    """No daylight saving: July is UTC-7 too."""
    call("/audit/logs", role="AUDITOR", query={"from": "2026-07-04", "to": "2026-07-04"})
    assert table.bounds()[0] == "2026-07-04T07:00:00.000000+00:00"


def test_range_spanning_months_queries_newest_month_first(auditor, table):
    """Each month is its own partition, read newest first."""
    table.pages = [{"Items": []}, {"Items": []}, {"Items": []}]
    call("/audit/logs", role="AUDITOR", query={"from": "2026-09-15", "to": "2026-11-02"})
    assert [table.month(i) for i in range(3)] == ["2026-11", "2026-10", "2026-09"]


@pytest.mark.parametrize("query", [
    {"from": "2026-11-10", "to": "2026-11-09"},
    {"from": "2025-01-01", "to": "2026-11-25"},
    {"from": "nope"},
    {"limit": "0"}, {"limit": "201"}, {"limit": "x"},
    {"action": "DROP"}, {"changedBy": "abc"},
    {"nextToken": "not-a-token"},
])
def test_bad_queries_are_400(auditor, table, query):
    """Reversed or over-long ranges, bad numbers and bad tokens are
    refused before DynamoDB is queried."""
    assert call("/audit/logs", role="AUDITOR", query=query)[0] == 400
    assert table.calls == []


def test_range_of_exactly_366_days_is_allowed(auditor, table):
    """366 days is the maximum."""
    assert call("/audit/logs", role="AUDITOR", query={"from": "2025-11-24", "to": "2026-11-25"})[0] == 200


# ---- results and paging ----------------------------------------------

def test_items_are_returned_with_parsed_values(auditor, table):
    """Old and new values are stored as JSON text and come back as
    objects; the user who made the change is included."""
    table.pages = [{"Items": [ITEM]}]
    status, body = call("/audit/logs", role="AUDITOR", query={"changedBy": "1", "table": "employee"})
    assert status == 200 and body["logs"] == [{
        "auditId": "a1", "table": "employee", "recordId": "7", "action": "UPDATE", "changedBy": 1,
        "changedByName": "Ivy Tran", "changedAt": "2026-11-20T18:00:00.000000+00:00",
        "oldValues": {"status": "ACTIVE"}, "newValues": {"status": "DEACTIVATED"}}]
    assert "FilterExpression" in table.calls[0]


def test_a_full_page_returns_a_token_that_continues_it(auditor, table):
    """When the page fills and DynamoDB has more, the token carries the
    month and position, and sending it back resumes there."""
    table.pages = [{"Items": [ITEM], "LastEvaluatedKey": {"month": "2026-11", "sk": "k"}}]
    status, body = call("/audit/logs", role="AUDITOR", query={"limit": "1"})
    token = json.loads(base64.urlsafe_b64decode(body["nextToken"]))
    assert token == {"m": "2026-11", "lek": {"month": "2026-11", "sk": "k"}}
    table.calls.clear()
    call("/audit/logs", role="AUDITOR", query={"limit": "1", "nextToken": body["nextToken"]})
    assert table.calls[0]["ExclusiveStartKey"] == {"month": "2026-11", "sk": "k"}


# ---- employee name lookup --------------------------------------------

def test_lookup_returns_only_id_name_and_email(auditor, sql):
    """The SQL selects just those four columns, and the response maps
    them to camelCase."""
    sql["rows"] = [{"employee_id": 3, "first_name": "Ana", "last_name": "Lee", "email": "ana@test.com"}]
    status, body = call("/audit/employees", role="AUDITOR", query={"search": "ana"})
    assert status == 200 and body == {"employees": [{"employeeId": 3, "firstName": "Ana", "lastName": "Lee", "email": "ana@test.com"}]}
    text, params = sql["calls"][0]
    assert text.split("FROM")[0].split() == ["SELECT", "employee_id,", "first_name,", "last_name,", "email"]
    assert params == ("%ana%", "%ana%", 20)


def test_lookup_escapes_wildcards(auditor, sql):
    """%, _ and backslash typed by the auditor are matched literally."""
    call("/audit/employees", role="AUDITOR", query={"search": "50%_\\"})
    assert sql["calls"][0][1][0] == "%50\\%\\_\\\\%"


@pytest.mark.parametrize("role", ["IT", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE"])
def test_only_auditors_can_use_the_lookup(caller, sql, role):
    """Staff roles are refused; they have their own employee lists."""
    caller["employee"]["role"] = role if role not in ("EMPLOYEE",) else None
    assert call("/audit/employees", role=role, query={"search": "a"})[0] == 403
    assert sql["calls"] == []


@pytest.mark.parametrize("query", [None, {"search": ""}, {"search": "x" * 101},
                                   {"search": "a", "limit": "0"}, {"search": "a", "limit": "51"}])
def test_lookup_validates_input(auditor, sql, query):
    """A missing, empty or oversized search, or a bad limit, is a 400
    before any SQL runs."""
    assert call("/audit/employees", role="AUDITOR", query=query)[0] == 400
    assert sql["calls"] == []
