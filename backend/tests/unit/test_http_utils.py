import base64
import datetime
import decimal
import json

import pytest

from payroll_common.http_utils import (
    HttpError, created, no_content, parse_body, qs, response, router,
)

"""Unit tests for payroll_common.http_utils, the request/response layer
shared by every API Lambda.

Approach: build plain API Gateway event dicts by hand and call the
functions directly. Router tests use tiny fake route handlers, so they
check the error-to-status mapping without any real business logic.
"""

ORIGIN = "https://app.example.com"


def body_of(res):
    return json.loads(res["body"])


def event(method="GET", resource="/things", body=None, **extra):
    return {"httpMethod": method, "resource": resource, "body": body, **extra}


# ---- responses -------------------------------------------------------

def test_response_sets_json_and_cors_headers(monkeypatch):
    """Every response carries the CORS headers the frontend needs,
    including the custom X-Active-Role header."""
    monkeypatch.delenv("CORS_ORIGIN", raising=False)
    res = response(200, {"ok": True})
    assert res["statusCode"] == 200 and body_of(res) == {"ok": True}
    assert res["headers"]["Content-Type"] == "application/json"
    assert res["headers"]["Access-Control-Allow-Origin"] == "*"
    assert "X-Active-Role" in res["headers"]["Access-Control-Allow-Headers"]


def test_response_uses_cors_origin_from_env(monkeypatch):
    """CORS_ORIGIN, when set, replaces the * wildcard."""
    monkeypatch.setenv("CORS_ORIGIN", ORIGIN)
    assert response(200, {})["headers"]["Access-Control-Allow-Origin"] == ORIGIN


def test_response_serialises_db_types():
    """Postgres returns Decimal, date and time objects; money becomes a
    number and times are trimmed to HH:MM."""
    res = response(200, {
        "pay": decimal.Decimal("1234.50"),
        "day": datetime.date(2026, 11, 14),
        "at": datetime.datetime(2026, 11, 14, 9, 30),
        "start": datetime.time(9, 30, 45),
    })
    assert body_of(res) == {
        "pay": 1234.5, "day": "2026-11-14",
        "at": "2026-11-14T09:30:00", "start": "09:30",
    }


def test_response_rejects_unknown_types():
    """Unexpected objects raise instead of being silently stringified,
    so the router turns them into a logged 500."""
    with pytest.raises(TypeError):
        response(200, {"x": object()})


def test_created_and_no_content_status_codes():
    """Creates return 201; deletes return 204 with an empty body, as
    REST clients expect."""
    assert created({"id": 1})["statusCode"] == 201
    res = no_content()
    assert res["statusCode"] == 204 and res["body"] == ""


# ---- request parsing -------------------------------------------------

@pytest.mark.parametrize("raw", [None, ""])
def test_parse_body_empty_is_empty_dict(raw):
    """A request with no body acts like {}, so handlers can always call
    .get() on the result."""
    assert parse_body(event(body=raw)) == {}


def test_parse_body_reads_json_object():
    """A normal JSON object body is decoded into a dict."""
    assert parse_body(event(body='{"name": "Ops"}')) == {"name": "Ops"}


def test_parse_body_decodes_base64():
    """API Gateway may base64-encode bodies; isBase64Encoded must be
    honoured or the JSON parse fails."""
    raw = base64.b64encode(b'{"name": "Ops"}').decode()
    assert parse_body(event(body=raw, isBase64Encoded=True)) == {"name": "Ops"}


@pytest.mark.parametrize("raw", ["[1, 2]", '"text"', "null", "{not json"])
def test_parse_body_rejects_non_objects(raw):
    """Arrays, bare values and broken JSON are a 400, so handlers never
    get something that isn't a dict."""
    with pytest.raises(HttpError, match="must be a JSON object") as err:
        parse_body(event(body=raw))
    assert err.value.status == 400


def test_qs_handles_missing_query_string():
    """API Gateway sends queryStringParameters as null when there are
    none; qs() turns that into {}."""
    assert qs({"queryStringParameters": None}) == {}
    assert qs({"queryStringParameters": {"a": "1"}}) == {"a": "1"}


# ---- router ----------------------------------------------------------

def test_router_dispatches_on_method_and_resource():
    """Routes match the API Gateway resource template (/things/{id}),
    not the concrete path, and the handler gets the whole event."""
    seen = []

    def get_thing(e):
        seen.append(e)
        return {"id": 1}

    ev = event("GET", "/things/{id}", path="/things/1")
    res = router({"GET /things/{id}": get_thing})(ev)
    assert res["statusCode"] == 200 and body_of(res) == {"id": 1}
    assert seen == [ev]


def test_router_wraps_none_as_ok():
    """Handlers with nothing to return still give the client JSON."""
    res = router({"GET /things": lambda e: None})(event())
    assert body_of(res) == {"ok": True}


def test_router_passes_full_responses_through():
    """A handler that already built a response (e.g. 201 Created) is
    not wrapped a second time."""
    res = router({"POST /things": lambda e: created({"id": 9})})(event("POST"))
    assert res["statusCode"] == 201 and body_of(res) == {"id": 9}


def test_router_unknown_route_is_404():
    """A method/resource pair with no handler gets a JSON 404."""
    res = router({"GET /things": lambda e: {}})(event("DELETE"))
    assert res["statusCode"] == 404
    assert body_of(res)["error"] == "Route not found"


def test_router_maps_http_error_to_status_and_details():
    """HttpError's status, message and details reach the client as-is;
    the frontend shows the message."""
    def conflict(e):
        raise HttpError(409, "Team has members", {"teams": ["Ops"]})

    res = router({"GET /things": conflict})(event())
    assert res["statusCode"] == 409
    assert body_of(res) == {
        "error": "Team has members", "details": {"teams": ["Ops"]},
    }


def test_router_hides_unexpected_errors(capsys):
    """Unexpected crashes become a generic 500; the exception text goes
    to the logs, never to the client."""
    def crash(e):
        raise RuntimeError("password=hunter2 leaked")

    res = router({"GET /things": crash})(event())
    assert res["statusCode"] == 500
    assert body_of(res) == {"error": "Internal server error"}
    assert "hunter2" not in res["body"]
    assert "hunter2" in capsys.readouterr().err
