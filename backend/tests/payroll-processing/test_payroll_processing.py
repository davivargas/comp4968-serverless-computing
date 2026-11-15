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