import datetime
import importlib.util
import json
import sys
import types
from contextlib import contextmanager
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock

import pytest


BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND / "layers" / "python"))
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
    "payroll_processing", BACKEND / "functions" / "payroll-processing" / "lambda_function.py"
)
processing = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(processing)

TODAY = datetime.date(2026, 11, 15)
ADMIN = {"employee_id": 17, "active_role": "PAYROLL_ADMIN"}


@pytest.fixture
def db(monkeypatch):
    connection = object()

    @contextmanager
    def transaction():
        yield connection

    monkeypatch.setattr(processing, "transaction", transaction)
    monkeypatch.setattr(processing, "get_conn", lambda: connection)
    return connection


def event(body=None, path=None, params=None):
    return {
        "body": json.dumps(body) if body is not None else None,
        "pathParameters": path,
        "queryStringParameters": params,
    }


@pytest.mark.parametrize(
    "status,end,unapproved,employees,can_release",
    [
        ("OPEN", datetime.date(2026, 11, 14), 0, 1, True),
        ("OPEN", TODAY, 0, 1, False),
        ("OPEN", datetime.date(2026, 11, 16), 0, 1, False),
        ("RELEASED", datetime.date(2026, 11, 14), 0, 1, False),
        ("OPEN", datetime.date(2026, 11, 14), 1, 1, False),
        ("OPEN", datetime.date(2026, 11, 14), 0, 0, False),
    ],
)
def test_list_periods_release_eligibility_and_shape(
    monkeypatch, db, status, end, unapproved, employees, can_release
):
    monkeypatch.setattr(processing.payroll, "today_bc", lambda: TODAY)
    ensure = Mock()
    monkeypatch.setattr(processing.payroll, "ensure_periods", ensure)
    query = Mock(return_value=[{
        "pay_period_id": 5, "start_date": datetime.date(2026, 11, 1),
        "end_date": end, "pay_date": datetime.date(2026, 11, 21),
        "status": status, "released_at": None, "unapproved_count": unapproved,
        "employee_count": employees,
    }])
    monkeypatch.setattr(processing, "query", query)

    result = processing.list_periods(event(params={"limit": "10", "offset": "2"}), ADMIN)

    assert result == {"payPeriods": [{
        "payPeriodId": 5, "start": datetime.date(2026, 11, 1), "end": end,
        "payDate": datetime.date(2026, 11, 21), "status": status,
        "unapprovedCount": unapproved, "employeeCount": employees,
        "canRelease": can_release, "releasedAt": None,
    }]}
    ensure.assert_called_once_with(db, TODAY)
    assert query.call_args.args[0] is db
    assert query.call_args.args[2] == (TODAY, 10, 2)


def test_list_periods_uses_default_paging_and_handles_no_rows(monkeypatch, db):
    monkeypatch.setattr(processing.payroll, "today_bc", lambda: TODAY)
    monkeypatch.setattr(processing.payroll, "ensure_periods", Mock())
    query = Mock(return_value=[])
    monkeypatch.setattr(processing, "query", query)

    assert processing.list_periods(event(), ADMIN) == {"payPeriods": []}
    assert query.call_args.args[2] == (TODAY, 26, 0)


@pytest.mark.parametrize("params", [{"limit": "0"}, {"limit": "101"}, {"offset": "-1"}, {"limit": "x"}])
def test_list_periods_rejects_invalid_paging_before_transaction(monkeypatch, params):
    monkeypatch.setattr(processing.payroll, "today_bc", lambda: TODAY)
    monkeypatch.setattr(processing, "transaction", lambda: pytest.fail("transaction should not start"))

    with pytest.raises(processing.HttpError) as exc:
        processing.list_periods(event(params=params), ADMIN)

    assert exc.value.status == 400


def test_release_passes_id_and_context_to_release_period(monkeypatch, db):
    release_period = Mock(return_value={"payPeriodId": 5, "status": "RELEASED"})
    monkeypatch.setattr(processing, "release_period", release_period)

    assert processing.release(event(path={"id": "5"}), ADMIN) == {
        "payPeriodId": 5, "status": "RELEASED"
    }
    release_period.assert_called_once_with(db, 5, ADMIN)


def test_release_propagates_release_errors(monkeypatch, db):
    monkeypatch.setattr(
        processing, "release_period",
        Mock(side_effect=processing.HttpError(409, "This pay period has already been released")),
    )

    with pytest.raises(processing.HttpError) as exc:
        processing.release(event(path={"id": "5"}), ADMIN)

    assert exc.value.status == 409
    assert str(exc.value) == "This pay period has already been released"


def test_release_rejects_invalid_id_before_transaction(monkeypatch):
    monkeypatch.setattr(processing, "transaction", lambda: pytest.fail("transaction should not start"))
    with pytest.raises(processing.HttpError) as exc:
        processing.release(event(path={"id": "abc"}), ADMIN)
    assert exc.value.status == 400


@pytest.mark.parametrize(
    "value, expected",
    [(0, "0.00"), (10000, "10000.00"), ("25.5", "25.50"), ("12.340", "12.34")],
)
def test_money_accepts_valid_rates(value, expected):
    assert processing.money(value, "hourlyRate") == Decimal(expected)


@pytest.mark.parametrize(
    "value, message",
    [
        (True, "hourlyRate must be a number"),
        (None, "hourlyRate must be a number"),
        ([], "hourlyRate must be a number"),
        ("abc", "hourlyRate must be a number"),
        ("NaN", "hourlyRate must be between 0 and 10000"),
        ("Infinity", "hourlyRate must be between 0 and 10000"),
        ("-0.01", "hourlyRate must be between 0 and 10000"),
        ("10000.01", "hourlyRate must be between 0 and 10000"),
        ("1.001", "hourlyRate can have at most 2 decimal places"),
    ],
)
def test_money_rejects_invalid_rates(value, message):
    with pytest.raises(processing.HttpError) as exc:
        processing.money(value, "hourlyRate")
    assert exc.value.status == 400
    assert str(exc.value) == message


@pytest.mark.parametrize(
    "wages, expected_current, expected_next",
    [
        ([], None, None),
        (
            [{"hourly_wage": Decimal("30"), "effective_from": TODAY}],
            {"hourlyRate": Decimal("30"), "effectiveFrom": TODAY},
            None,
        ),
        (
            [
                {"hourly_wage": Decimal("20"), "effective_from": datetime.date(2025, 1, 1)},
                {"hourly_wage": Decimal("30"), "effective_from": TODAY},
                {"hourly_wage": Decimal("40"), "effective_from": datetime.date(2026, 12, 1)},
                {"hourly_wage": Decimal("50"), "effective_from": datetime.date(2027, 1, 1)},
            ],
            {"hourlyRate": Decimal("30"), "effectiveFrom": TODAY},
            {"hourlyRate": Decimal("40"), "effectiveFrom": datetime.date(2026, 12, 1)},
        ),
        (
            [{"hourly_wage": Decimal("40"), "effective_from": datetime.date(2026, 12, 1)}],
            None,
            {"hourlyRate": Decimal("40"), "effectiveFrom": datetime.date(2026, 12, 1)},
        ),
    ],
)
def test_position_json_selects_current_and_next_wages(monkeypatch, db, wages, expected_current, expected_next):
    monkeypatch.setattr(processing.payroll, "today_bc", lambda: TODAY)
    one = Mock(return_value={"position_id": 5, "title": "Analyst", "pay_grade": "P2"})
    query = Mock(return_value=wages)
    monkeypatch.setattr(processing, "one", one)
    monkeypatch.setattr(processing, "query", query)

    assert processing.position_json(db, 5) == {
        "positionId": 5, "title": "Analyst", "payGrade": "P2",
        "hourlyRate": expected_current["hourlyRate"] if expected_current else None,
        "effectiveFrom": expected_current["effectiveFrom"] if expected_current else None,
        "nextWage": expected_next,
    }
    assert one.call_args.args[2] == (5,)
    assert query.call_args.args[2] == (5,)
    assert "ORDER BY effective_from" in query.call_args.args[1]


def test_list_positions_returns_non_deleted_positions_in_database_order(monkeypatch, db):
    query = Mock(return_value=[{"position_id": 1}, {"position_id": 2}])
    position_json = Mock(side_effect=[{"positionId": 1}, {"positionId": 2}])
    monkeypatch.setattr(processing, "query", query)
    monkeypatch.setattr(processing, "position_json", position_json)

    assert processing.list_positions(event(), ADMIN) == {"positions": [{"positionId": 1}, {"positionId": 2}]}
    assert "NOT is_deleted ORDER BY title" in query.call_args.args[1]
    assert position_json.call_args_list[0].args == (db, 1)
    assert position_json.call_args_list[1].args == (db, 2)


def test_create_position_inserts_wage_and_audits_both_records(monkeypatch, db):
    one = Mock(side_effect=[None, {"position_id": 5}])
    query = Mock()
    audit = Mock()
    monkeypatch.setattr(processing, "one", one)
    monkeypatch.setattr(processing, "query", query)
    monkeypatch.setattr(processing, "audit", audit)
    monkeypatch.setattr(processing, "position_json", Mock(return_value={"positionId": 5}))

    response = processing.create_position(event(body={
        "title": " Analyst ", "payGrade": " P2 ", "hourlyRate": "42.50",
        "effectiveFrom": "2026-01-01",
    }), ADMIN)

    assert response["statusCode"] == 201
    assert json.loads(response["body"]) == {"positionId": 5}
    assert one.call_args_list[0].args[2] == ("Analyst", 0)
    assert one.call_args_list[1].args[2] == ("Analyst", "P2")
    assert query.call_args.args[2] == (5, Decimal("42.50"), datetime.date(2026, 1, 1), 17)
    assert audit.call_args_list[0].args == (
        db, ADMIN, "position", 5, "INSERT", None, {"title": "Analyst", "pay_grade": "P2"}
    )
    assert audit.call_args_list[1].args == (
        db, ADMIN, "position_wage", "5:2026-01-01", "INSERT", None,
        {"position_id": 5, "hourly_wage": Decimal("42.50"), "effective_from": datetime.date(2026, 1, 1)},
    )


def test_create_position_rejects_duplicate_title_without_writes(monkeypatch, db):
    monkeypatch.setattr(processing, "one", Mock(return_value={"position_exists": 1}))
    query = Mock()
    monkeypatch.setattr(processing, "query", query)

    with pytest.raises(processing.HttpError) as exc:
        processing.create_position(event(body={
            "title": "Analyst", "payGrade": "P2", "hourlyRate": "42.50", "effectiveFrom": "2026-01-01",
        }), ADMIN)

    assert exc.value.status == 409
    query.assert_not_called()


@pytest.mark.parametrize(
    "body, message",
    [
        ({}, "title is required"),
        ({"title": "Analyst"}, "payGrade is required"),
        ({"title": "Analyst", "payGrade": "P2", "hourlyRate": "10", "effectiveFrom": "2026-02-30"},
         "effectiveFrom must be a date (YYYY-MM-DD)"),
    ],
)
def test_create_position_rejects_invalid_input_before_transaction(monkeypatch, body, message):
    monkeypatch.setattr(processing, "transaction", lambda: pytest.fail("transaction should not start"))
    with pytest.raises(processing.HttpError) as exc:
        processing.create_position(event(body=body), ADMIN)
    assert exc.value.status == 400
    assert str(exc.value) == message


@pytest.mark.parametrize(
    "body, message",
    [
        ({}, "No updatable fields supplied"),
        ({"hourlyRate": "20"}, "A wage change needs hourlyRate and effectiveFrom together"),
        ({"effectiveFrom": "2026-01-01"}, "A wage change needs hourlyRate and effectiveFrom together"),
        ({"isDeleted": False}, "isDeleted only accepts true"),
        ({"title": " "}, "title is required"),
        ({"payGrade": ""}, "payGrade is required"),
    ],
)
def test_update_position_rejects_invalid_input_before_transaction(monkeypatch, body, message):
    monkeypatch.setattr(processing, "transaction", lambda: pytest.fail("transaction should not start"))
    with pytest.raises(processing.HttpError) as exc:
        processing.update_position(event(body=body, path={"id": "5"}), ADMIN)
    assert exc.value.status == 400
    assert str(exc.value) == message


@pytest.mark.parametrize(
    "body, rows, status, message",
    [
        ({"title": "New"}, [None], 404, "Position not found"),
        ({"isDeleted": True}, [{"title": "Old"}, {"employee_exists": 1}], 409,
         "Employees still hold this position; change their position first"),
        ({"title": "New"}, [{"title": "Old"}, {"position_exists": 1}], 409,
         "A position with that title already exists"),
        (
            {"hourlyRate": "25", "effectiveFrom": "2026-11-14"},
            [{"title": "Old"}, {"latest_released_period_end": datetime.date(2026, 11, 14)}],
            400, "effectiveFrom must be after 2026-11-14, the end of the latest released pay period",
        ),
    ],
)
def test_update_position_rejects_conflicts_without_writes(monkeypatch, db, body, rows, status, message):
    one = Mock(side_effect=rows)
    query = Mock()
    monkeypatch.setattr(processing, "one", one)
    monkeypatch.setattr(processing, "query", query)

    with pytest.raises(processing.HttpError) as exc:
        processing.update_position(event(body=body, path={"id": "5"}), ADMIN)

    assert exc.value.status == status
    assert str(exc.value) == message
    query.assert_not_called()
    if "title" in body and len(rows) == 2:
        assert one.call_args_list[1].args[2] == ("New", 5)


@pytest.mark.parametrize(
    "previous, action, old_value",
    [
        (None, "INSERT", None),
        ({"hourly_wage": Decimal("20")}, "UPDATE", {"hourly_wage": Decimal("20")}),
    ],
)
def test_update_position_upserts_wage_and_audits(monkeypatch, db, previous, action, old_value):
    one = Mock(side_effect=[
        {"title": "Old", "pay_grade": "P1"},
        {"latest_released_period_end": datetime.date(2026, 11, 14)},
        previous,
    ])
    query, audit = Mock(), Mock()
    monkeypatch.setattr(processing, "one", one)
    monkeypatch.setattr(processing, "query", query)
    monkeypatch.setattr(processing, "audit", audit)
    monkeypatch.setattr(processing, "position_json", Mock(return_value={"positionId": 5}))

    result = processing.update_position(event(path={"id": "5"}, body={
        "hourlyRate": "25.50", "effectiveFrom": "2026-11-15",
    }), ADMIN)

    assert result == {"positionId": 5}
    assert "ON CONFLICT" in query.call_args.args[1]
    assert query.call_args.args[2] == (5, Decimal("25.50"), TODAY, 17)
    assert audit.call_args.args == (
        db, ADMIN, "position_wage", "5:2026-11-15", action, old_value,
        {"hourly_wage": Decimal("25.50"), "effective_from": TODAY},
    )


def test_update_position_changes_fields_and_deletes_when_unassigned(monkeypatch, db):
    one = Mock(side_effect=[{"title": "Old", "pay_grade": "P1"}, None, None])
    query, audit = Mock(), Mock()
    monkeypatch.setattr(processing, "one", one)
    monkeypatch.setattr(processing, "query", query)
    monkeypatch.setattr(processing, "audit", audit)

    response = processing.update_position(event(path={"id": "5"}, body={
        "title": "New", "payGrade": "P2", "isDeleted": True,
    }), ADMIN)

    assert response["statusCode"] == 204
    assert response["body"] == ""
    assert query.call_args_list[0].args[2] == ["New", "P2", 5]
    assert query.call_args_list[1].args[2] == (5,)
    assert audit.call_args_list[0].args == (
        db, ADMIN, "position", 5, "UPDATE", {"title": "Old", "pay_grade": "P1"},
        {"title": "New", "pay_grade": "P2"},
    )
    assert audit.call_args_list[1].args == (
        db, ADMIN, "position", 5, "DELETE", {"is_deleted": False}, {"is_deleted": True}
    )