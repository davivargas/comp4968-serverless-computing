import datetime
import importlib.util
import json
import sys
import types
from decimal import Decimal
from pathlib import Path

import pytest


BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND / "layers" / "python"))
# Service dependencies are only used at runtime; all external calls are mocked here.
sys.modules.setdefault("boto3", types.ModuleType("boto3"))
pg8000 = types.ModuleType("pg8000")
pg8000.dbapi = types.ModuleType("pg8000.dbapi")
sys.modules.setdefault("pg8000", pg8000)
sys.modules.setdefault("pg8000.dbapi", pg8000.dbapi)
dateutil = types.ModuleType("dateutil")
dateutil.relativedelta = types.ModuleType("dateutil.relativedelta")
dateutil.relativedelta.relativedelta = object
sys.modules.setdefault("dateutil", dateutil)
sys.modules.setdefault("dateutil.relativedelta", dateutil.relativedelta)
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
