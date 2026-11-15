import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


BACKEND = Path(__file__).resolve().parents[3]
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
    "employee_profiles", BACKEND / "functions" / "employee-profiles" / "lambda_function.py"
)
employee_profiles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(employee_profiles)


def test_get_me_returns_authenticated_employee_details():
    result = employee_profiles.get_me({}, {
        "employee_id": 17, "first_name": "Ada", "last_name": "Lovelace",
        "available": ["EMPLOYEE", "MANAGER"],
    })

    assert result == {
        "employeeId": 17, "firstName": "Ada", "lastName": "Lovelace",
        "availableRoles": ["EMPLOYEE", "MANAGER"],
    }


def test_get_profile_checks_self_before_database_access(monkeypatch):
    monkeypatch.setattr(employee_profiles, "get_conn", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(employee_profiles.HttpError) as exc:
        employee_profiles.get_profile({"pathParameters": {"id": "18"}}, {"employee_id": 17})

    assert exc.value.status == 403
    assert str(exc.value) == "You can only access your own records"


def test_profile_shapes_address_and_masks_deposit(monkeypatch):
    row = {
        "employee_id": 17, "first_name": "Ada", "last_name": "Lovelace", "email": "ada@example.test",
        "position": "Analyst", "pay_grade": "P2", "hourly_wage": 42.5, "phone": "+16045550142",
        "street": "1 Main St", "city": "Vancouver", "province": "BC", "postal_code": "V6B 1A1", "country": "CA",
        "institution_no": "001", "transit_no": "12345", "account_last4": "6789",
    }
    monkeypatch.setattr(employee_profiles, "today_bc", lambda: "2026-11-15")
    monkeypatch.setattr(employee_profiles, "one", lambda conn, sql, params: row)

    result = employee_profiles._profile(object(), 17)

    assert result["address"] == {
        "street": "1 Main St", "city": "Vancouver", "province": "BC",
        "postalCode": "V6B 1A1", "country": "CA",
    }
    assert result["directDeposit"] == {
        "institutionNumber": "001", "transitNumber": "12345", "accountNumber": "****6789",
    }
    assert result["hourlyRate"] == 42.5


@pytest.mark.parametrize("body, message", [
    ({}, "No updatable fields supplied"),
    ({"phone": "6045550142"}, "phone must be a valid Canadian or US number in E.164 format, e.g. +16045550142"),
])
def test_update_profile_rejects_empty_or_invalid_updates_before_db(monkeypatch, body, message):
    monkeypatch.setattr(employee_profiles, "transaction", lambda: pytest.fail("database should not be reached"))
    event = {"pathParameters": {"id": "17"}, "body": json.dumps(body)}

    with pytest.raises(employee_profiles.HttpError) as exc:
        employee_profiles.update_profile(event, {"employee_id": 17})

    assert exc.value.status == 400
    assert str(exc.value) == message


def test_lambda_handler_routes_get_me(monkeypatch):
    from payroll_common import auth

    monkeypatch.setattr(auth, "authenticate", lambda event: {
        "employee_id": 17, "first_name": "Ada", "last_name": "Lovelace",
        "available": ["EMPLOYEE"], "active_role": "EMPLOYEE",
    })

    response = employee_profiles.lambda_handler({"httpMethod": "GET", "resource": "/me"}, None)

    assert response["statusCode"] == 200
    assert json.loads(response["body"])["employeeId"] == 17
