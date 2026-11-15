import datetime
import importlib.util
import json
import sys
from decimal import Decimal
from pathlib import Path

import pytest


BACKEND = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(BACKEND / "layers" / "python"))
SPEC = importlib.util.spec_from_file_location(
    "employee_pay", BACKEND / "functions" / "employee-pay" / "lambda_function.py"
)
employee_pay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(employee_pay)


def test_bounds_cover_month_end_leap_year_and_quarter_end():
    assert employee_pay._bounds("monthly", datetime.date(2024, 2, 1), 2024) == (
        "2024-02", datetime.date(2024, 2, 1), datetime.date(2024, 2, 29)
    )
    assert employee_pay._bounds("quarterly", datetime.date(2026, 10, 1), 2026) == (
        "2026-Q4", datetime.date(2026, 10, 1), datetime.date(2026, 12, 31)
    )


@pytest.mark.parametrize(
    "today, year, expected_end",
    [
        (datetime.date(2026, 11, 15), 2026, datetime.date(2026, 11, 15)),
        (datetime.date(2026, 11, 15), 2025, datetime.date(2025, 12, 31)),
    ],
)
def test_bounds_for_ytd_clamps_end_to_today_or_year_end(monkeypatch, today, year, expected_end):
    monkeypatch.setattr(employee_pay, "today_bc", lambda: today)

    assert employee_pay._bounds("ytd", datetime.date(1900, 1, 1), year) == (
        "YTD", datetime.date(year, 1, 1), expected_end
    )


def test_aggregate_pay_uses_default_year_and_shapes_monthly_periods(monkeypatch):
    calls = []
    row = {
        "period_key": datetime.date(2026, 2, 1),
        "hours": Decimal("80"),
        "gross": Decimal("4000"),
        "federal_tax": Decimal("400"),
        "provincial_tax": Decimal("150"),
        "cpp": Decimal("200"),
        "ei": Decimal("60"),
        "net": Decimal("3190"),
    }
    monkeypatch.setattr(employee_pay, "today_bc", lambda: datetime.date(2026, 11, 15))
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: calls.append((sql, params)) or [row])

    result = employee_pay.aggregate_pay(
        {"pathParameters": {"id": "17"}, "queryStringParameters": {"granularity": "monthly"}},
        {"employee_id": 17},
    )

    assert result == {
        "employeeId": 17,
        "year": 2026,
        "granularity": "monthly",
        "periods": [{
            "label": "2026-02",
            "start": datetime.date(2026, 2, 1),
            "end": datetime.date(2026, 2, 28),
            "hours": Decimal("80"),
            "gross": Decimal("4000"),
            "deductions": {
                "federalTax": Decimal("400"),
                "provincialTax": Decimal("150"),
                "cpp": Decimal("200"),
                "ei": Decimal("60"),
            },
            "net": Decimal("3190"),
        }],
    }
    sql, params = calls[0]
    assert "date_trunc('month', pp.pay_date)::date" in sql
    assert "EXTRACT(YEAR FROM pp.pay_date) = %s" in sql
    assert params == (17, 2026)


def test_aggregate_pay_accepts_explicit_year_and_empty_result(monkeypatch):
    calls = []
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: calls.append(params) or [])

    result = employee_pay.aggregate_pay(
        {
            "pathParameters": {"id": "17"},
            "queryStringParameters": {"year": "2024", "granularity": "quarterly"},
        },
        {"employee_id": 17},
    )

    assert result == {"employeeId": 17, "year": 2024, "granularity": "quarterly", "periods": []}
    assert calls == [(17, 2024)]


@pytest.mark.parametrize(
    "query_parameters, message",
    [
        ({"granularity": "weekly"}, "granularity must be one of: monthly, quarterly, ytd"),
        ({"year": "not-a-year"}, "year must be an integer"),
        ({"year": "2026.5"}, "year must be an integer"),
    ],
)
def test_aggregate_pay_rejects_invalid_query_before_database(
    monkeypatch, query_parameters, message
):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: pytest.fail("database should not be reached"))
    event = {"pathParameters": {"id": "17"}, "queryStringParameters": query_parameters}

    with pytest.raises(employee_pay.HttpError) as exc:
        employee_pay.aggregate_pay(event, {"employee_id": 17})

    assert exc.value.status == 400
    assert str(exc.value) == message


def test_employee_pay_endpoints_reject_other_employees_before_database(monkeypatch):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: pytest.fail("database should not be reached"))
    event = {"pathParameters": {"id": "18", "payDate": "2026-11-13"}}

    for endpoint in (employee_pay.aggregate_pay, employee_pay.list_stubs, employee_pay.get_stub):
        with pytest.raises(employee_pay.HttpError) as exc:
            endpoint(event, {"employee_id": 17})
        assert exc.value.status == 403
        assert str(exc.value) == "You can only access your own records"


@pytest.mark.parametrize(
    "endpoint, event",
    [
        (employee_pay.aggregate_pay, {"pathParameters": {"id": "not-an-id"}}),
        (employee_pay.list_stubs, {"pathParameters": {"id": "not-an-id"}}),
        (
            employee_pay.get_stub,
            {"pathParameters": {"id": "not-an-id", "payDate": "2026-11-13"}},
        ),
    ],
)
def test_employee_pay_endpoints_reject_invalid_employee_ids_before_database(
    monkeypatch, endpoint, event
):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(employee_pay.HttpError) as exc:
        endpoint(event, {"employee_id": 17})

    assert exc.value.status == 400
    assert str(exc.value) == "id must be an integer"


def test_list_stubs_applies_both_pay_date_bounds_and_shapes_rows(monkeypatch):
    calls = []
    rows = [
        {
            "pay_date": datetime.date(2026, 11, 13),
            "start_date": datetime.date(2026, 10, 26),
            "end_date": datetime.date(2026, 11, 8),
            "hours": Decimal("80"),
            "gross_pay": Decimal("4000"),
            "net_pay": Decimal("3190"),
        }
    ]
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: calls.append((sql, params)) or rows)

    result = employee_pay.list_stubs(
        {
            "pathParameters": {"id": "17"},
            "queryStringParameters": {"from": "2026-01-01", "to": "2026-12-31"},
        },
        {"employee_id": 17},
    )

    assert result == {
        "payStubs": [{
            "payDate": datetime.date(2026, 11, 13),
            "periodStart": datetime.date(2026, 10, 26),
            "periodEnd": datetime.date(2026, 11, 8),
            "hours": Decimal("80"),
            "gross": Decimal("4000"),
            "net": Decimal("3190"),
        }]
    }
    sql, params = calls[0]
    assert "pp.pay_date >= %s" in sql
    assert "pp.pay_date <= %s" in sql
    assert "ORDER BY pp.pay_date DESC" in sql
    assert params == [17, datetime.date(2026, 1, 1), datetime.date(2026, 12, 31)]


def test_list_stubs_without_filters_returns_empty_list(monkeypatch):
    calls = []
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: calls.append((sql, params)) or [])

    assert employee_pay.list_stubs(
        {"pathParameters": {"id": "17"}, "queryStringParameters": None},
        {"employee_id": 17},
    ) == {"payStubs": []}
    assert calls[0][1] == [17]
    assert "pp.pay_date >=" not in calls[0][0]
    assert "pp.pay_date <=" not in calls[0][0]


@pytest.mark.parametrize("parameter", ["from", "to"])
@pytest.mark.parametrize("invalid_date", ["2026-02-30", "11/13/2026"])
def test_list_stubs_rejects_invalid_date_filters(monkeypatch, parameter, invalid_date):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(employee_pay.HttpError) as exc:
        employee_pay.list_stubs(
            {
                "pathParameters": {"id": "17"},
                "queryStringParameters": {parameter: invalid_date},
            },
            {"employee_id": 17},
        )

    assert exc.value.status == 400
    assert str(exc.value) == f"{parameter} must be a date (YYYY-MM-DD)"


def _paystub_row(**overrides):
    row = {
        "paystub_id": 91,
        "employee_id": 17,
        "employee_name": "Ada Lovelace",
        "position_title": "Analyst",
        "pay_date": datetime.date(2026, 11, 13),
        "start_date": datetime.date(2026, 10, 26),
        "end_date": datetime.date(2026, 11, 8),
        "regular_hours": Decimal("40"),
        "overtime_hours": Decimal("5"),
        "double_overtime_hours": Decimal("2"),
        "weekend_hours": Decimal("3"),
        "stat_hours": Decimal("4"),
        "sick_hours": Decimal("1"),
        "vacation_leave_hours": Decimal("2"),
        "regular_pay": Decimal("1700"),
        "overtime_pay": Decimal("318.75"),
        "double_overtime_pay": Decimal("170"),
        "weekend_pay": Decimal("191.25"),
        "stat_pay": Decimal("255"),
        "sick_pay": Decimal("42.50"),
        "vacation_pay": Decimal("107.12"),
        "gross_pay": Decimal("2784.62"),
        "net_pay": Decimal("2100.00"),
        "federal_tax": Decimal("300"),
        "provincial_tax": Decimal("100"),
        "cpp": Decimal("200"),
        "ei": Decimal("84.62"),
        "ytd_hours": Decimal("1000"),
        "ytd_gross": Decimal("50000"),
        "ytd_federal_tax": Decimal("5000"),
        "ytd_provincial_tax": Decimal("2000"),
        "ytd_cpp": Decimal("3000"),
        "ytd_ei": Decimal("800"),
        "ytd_net": Decimal("39200"),
        "deposit_account_last4": "0123",
    }
    row.update(overrides)
    return row


def test_get_stub_maps_paystub_breakdown_earnings_ytd_and_masks_account(monkeypatch):
    calls = []
    paystub = _paystub_row()
    earnings = [{
        "line_type": "PROJECT",
        "project_code": "PRJ-100",
        "hours": Decimal("40"),
        "rate": Decimal("42.50"),
        "amount": Decimal("1700"),
    }]
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(
        employee_pay, "one",
        lambda conn, sql, params: calls.append(("one", params)) or paystub,
    )
    monkeypatch.setattr(
        employee_pay, "query",
        lambda conn, sql, params: calls.append(("query", params)) or earnings,
    )

    result = employee_pay.get_stub(
        {"pathParameters": {"id": "17", "payDate": "2026-11-13"}},
        {"employee_id": 17},
    )

    assert result == {
        "employeeId": 17,
        "employeeName": "Ada Lovelace",
        "position": "Analyst",
        "payDate": datetime.date(2026, 11, 13),
        "periodStart": datetime.date(2026, 10, 26),
        "periodEnd": datetime.date(2026, 11, 8),
        "hours": 55.0,
        "hoursBreakdown": {
            "regular": {"hours": Decimal("40"), "pay": Decimal("1700")},
            "overtime": {"hours": Decimal("5"), "pay": Decimal("318.75")},
            "doubleOvertime": {"hours": Decimal("2"), "pay": Decimal("170")},
            "weekend": {"hours": Decimal("3"), "pay": Decimal("191.25")},
            "statHoliday": {"hours": Decimal("4"), "pay": Decimal("255")},
            "sick": {"hours": Decimal("1"), "pay": Decimal("42.50")},
            "vacationLeaveHours": Decimal("2"),
            "vacationPay": Decimal("107.12"),
        },
        "gross": Decimal("2784.62"),
        "net": Decimal("2100.00"),
        "earnings": [{
            "lineType": "PROJECT",
            "projectCode": "PRJ-100",
            "hours": Decimal("40"),
            "rate": Decimal("42.50"),
            "amount": Decimal("1700"),
        }],
        "deductions": {
            "federalTax": Decimal("300"),
            "provincialTax": Decimal("100"),
            "cpp": Decimal("200"),
            "ei": Decimal("84.62"),
        },
        "ytd": {
            "hours": Decimal("1000"),
            "gross": Decimal("50000"),
            "deductions": {
                "federalTax": Decimal("5000"),
                "provincialTax": Decimal("2000"),
                "cpp": Decimal("3000"),
                "ei": Decimal("800"),
            },
            "net": Decimal("39200"),
        },
        "depositAccount": "****0123",
    }
    assert calls == [("one", (17, datetime.date(2026, 11, 13))), ("query", (91,))]


def test_get_stub_rejects_invalid_pay_date_before_database(monkeypatch):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(employee_pay.HttpError) as exc:
        employee_pay.get_stub(
            {"pathParameters": {"id": "17", "payDate": "2026-02-30"}},
            {"employee_id": 17},
        )

    assert exc.value.status == 400
    assert str(exc.value) == "payDate must be a date (YYYY-MM-DD)"


def test_get_stub_returns_404_without_loading_earnings(monkeypatch):
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "one", lambda conn, sql, params: None)
    monkeypatch.setattr(employee_pay, "query", lambda *args: pytest.fail("earnings should not be queried"))

    with pytest.raises(employee_pay.HttpError) as exc:
        employee_pay.get_stub(
            {"pathParameters": {"id": "17", "payDate": "2026-11-13"}},
            {"employee_id": 17},
        )

    assert exc.value.status == 404
    assert str(exc.value) == "No pay stub for that pay date"


@pytest.mark.parametrize("last4, expected", [("9876", "****9876"), (None, None), ("", None)])
def test_get_stub_masks_missing_deposit_account(monkeypatch, last4, expected):
    paystub = _paystub_row(
        regular_hours=0, overtime_hours=0, double_overtime_hours=0,
        weekend_hours=0, stat_hours=0, sick_hours=0, deposit_account_last4=last4,
    )
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "one", lambda conn, sql, params: paystub)
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: [])

    result = employee_pay.get_stub(
        {"pathParameters": {"id": "17", "payDate": "2026-11-13"}},
        {"employee_id": 17},
    )

    assert result["hours"] == 0
    assert result["earnings"] == []
    assert result["depositAccount"] == expected


def test_lambda_handler_serializes_dates_and_decimals(monkeypatch):
    from payroll_common import auth

    monkeypatch.setattr(auth, "authenticate", lambda event: {"employee_id": 17, "active_role": "EMPLOYEE"})
    monkeypatch.setattr(employee_pay, "get_conn", lambda: "connection")
    monkeypatch.setattr(employee_pay, "query", lambda conn, sql, params: [{
        "pay_date": datetime.date(2026, 11, 13),
        "start_date": datetime.date(2026, 10, 26),
        "end_date": datetime.date(2026, 11, 8),
        "hours": Decimal("80.5"),
        "gross_pay": Decimal("4000.25"),
        "net_pay": Decimal("3190.10"),
    }])

    response = employee_pay.lambda_handler({
        "httpMethod": "GET",
        "resource": "/employee/{id}/pay-stubs",
        "pathParameters": {"id": "17"},
        "queryStringParameters": None,
    }, None)

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {
        "payStubs": [{
            "payDate": "2026-11-13",
            "periodStart": "2026-10-26",
            "periodEnd": "2026-11-08",
            "hours": 80.5,
            "gross": 4000.25,
            "net": 3190.1,
        }]
    }


def test_lambda_handler_enforces_employee_role(monkeypatch):
    from payroll_common import auth

    monkeypatch.setattr(auth, "authenticate", lambda event: {"employee_id": 17, "active_role": "MANAGER"})

    response = employee_pay.lambda_handler({
        "httpMethod": "GET",
        "resource": "/employee/{id}/pay-stubs",
        "pathParameters": {"id": "17"},
    }, None)

    assert response["statusCode"] == 403
    assert json.loads(response["body"]) == {
        "error": "This page requires the EMPLOYEE role",
        "details": None,
    }


def test_lambda_handler_returns_http_errors_and_unknown_route_as_json():
    response = employee_pay.lambda_handler(
        {"httpMethod": "GET", "resource": "/not-a-route"}, None
    )

    assert response["statusCode"] == 404
    assert json.loads(response["body"]) == {"error": "Route not found", "details": None}
