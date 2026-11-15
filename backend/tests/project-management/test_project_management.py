import importlib.util
import json
import sys
from pathlib import Path

import pytest


BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND / "layers" / "python"))
SPEC = importlib.util.spec_from_file_location(
    "project_management", BACKEND / "functions" / "project-management" / "lambda_function.py"
)
project_management = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(project_management)


def test_employee_projects_requires_self_before_database_access(monkeypatch):
    monkeypatch.setattr(project_management, "get_conn", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(project_management.HttpError) as exc:
        project_management.employee_projects({"pathParameters": {"id": "8"}}, {"employee_id": 7})

    assert exc.value.status == 403
    assert str(exc.value) == "You can only access your own records"


def test_employee_projects_filters_search_and_formats_rows(monkeypatch):
    calls = []
    monkeypatch.setattr(project_management, "get_conn", lambda: "connection")

    def fake_query(conn, sql, params):
        calls.append((sql, params))
        return [{"project_code": 12, "name": "Payroll", "special_type": None}]

    monkeypatch.setattr(project_management, "query", fake_query)
    result = project_management.employee_projects(
        {"pathParameters": {"id": "7"}, "queryStringParameters": {"search": "pay"}},
        {"employee_id": 7},
    )

    assert result == {"projects": [{"projectCode": 12, "name": "Payroll", "specialType": None}]}
    assert calls[0][1] == [7, "%pay%", "%pay%"]
    assert "p.status = 'ACTIVE'" in calls[0][0]
    assert "NOT p.is_deleted" in calls[0][0]


def test_manager_employees_applies_project_filter_and_order(monkeypatch):
    calls = []
    monkeypatch.setattr(project_management, "get_conn", lambda: "connection")

    def fake_query(conn, sql, params):
        calls.append((sql, params))
        return [{"employee_id": 8, "first_name": "Grace", "last_name": "Hopper", "email": "g@example.test",
                 "status": "ACTIVE", "position": "Engineer", "team": "Platform"}]

    monkeypatch.setattr(project_management, "query", fake_query)
    result = project_management.manager_employees(
        {"pathParameters": {"id": "7"}, "queryStringParameters": {"projectId": "19", "sort": "id", "order": "desc"}},
        {"employee_id": 7},
    )

    assert result["employees"][0]["employeeId"] == 8
    assert calls[0][1] == [7, 19]
    assert "ORDER BY e.employee_id DESC" in calls[0][0]


def test_create_project_allocates_code_and_returns_created_response(monkeypatch):
    calls = []

    class FakeTransaction:
        def __enter__(self):
            return "connection"

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_one(conn, sql, params=None):
        calls.append((sql, params))
        if "COALESCE(MAX(project_code)" in sql:
            return {"n": 23}
        if "INSERT INTO project" in sql:
            return {"project_id": 5}
        if "WHERE p.project_id" in sql:
            return {"project_id": 5, "project_code": 23, "name": "Migration", "status": "ACTIVE", "employee_count": 0}
        raise AssertionError(sql)

    monkeypatch.setattr(project_management, "transaction", FakeTransaction)
    monkeypatch.setattr(project_management, "query", lambda *args: [])
    monkeypatch.setattr(project_management, "one", fake_one)
    monkeypatch.setattr(project_management, "audit", lambda *args: None)

    response = project_management.create_project({"body": json.dumps({"name": " Migration "})}, {"employee_id": 7})

    assert response["statusCode"] == 201
    assert json.loads(response["body"]) == {
        "projectId": 5, "projectCode": 23, "name": "Migration", "status": "ACTIVE", "employeeCount": 0,
    }
    assert calls[1][1] == (7,)


@pytest.mark.parametrize("body, status, message", [
    ({"name": ""}, 400, "name is required"),
    ({"name": "Project", "projectCode": 0}, 400, "projectCode must be a positive integer"),
])
def test_create_project_validates_input_before_database(monkeypatch, body, status, message):
    monkeypatch.setattr(project_management, "transaction", lambda: pytest.fail("database should not be reached"))

    with pytest.raises(project_management.HttpError) as exc:
        project_management.create_project({"body": json.dumps(body)}, {"employee_id": 7})

    assert exc.value.status == status
    assert str(exc.value) == message


def test_assign_employee_rejects_non_team_member(monkeypatch):
    class FakeTransaction:
        def __enter__(self):
            return "connection"

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_one(conn, sql, params=None):
        if "FROM project WHERE" in sql:
            return {"project_id": 9, "created_by": 7, "status": "ACTIVE", "special_type": None}
        return None

    monkeypatch.setattr(project_management, "transaction", FakeTransaction)
    monkeypatch.setattr(project_management, "one", fake_one)

    with pytest.raises(project_management.HttpError) as exc:
        project_management.assign_employee(
            {"pathParameters": {"id": "9"}, "body": json.dumps({"employeeId": 8})},
            {"employee_id": 7},
        )

    assert exc.value.status == 400
    assert str(exc.value) == "That employee is not an active member of a team you manage"


def test_update_project_rejects_delete_when_project_is_in_use(monkeypatch):
    class FakeTransaction:
        def __enter__(self):
            return "connection"

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_one(conn, sql, params=None):
        if "SELECT * FROM project" in sql:
            return {"project_id": 9, "created_by": 7, "special_type": None}
        return {"assigned": 1, "entries": 0}

    monkeypatch.setattr(project_management, "transaction", FakeTransaction)
    monkeypatch.setattr(project_management, "one", fake_one)

    with pytest.raises(project_management.HttpError) as exc:
        project_management.update_project(
            {"pathParameters": {"id": "9"}, "body": json.dumps({"isDeleted": True})}, {"employee_id": 7}
        )

    assert exc.value.status == 409
    assert "close it instead of deleting it" in str(exc.value)
