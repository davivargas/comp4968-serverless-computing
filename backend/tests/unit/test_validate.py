import datetime

import pytest

from payroll_common.http_utils import HttpError
from payroll_common.validate import (
    address, address_json, digits, one_of, opt_date, opt_int, opt_str,
    order_by, paging, path_id, phone_e164, require_bool_true, require_date,
    require_email, require_int, require_str, require_time,
)

"""Unit tests for payroll_common.validate, the input checks every Lambda
runs before touching the database.

Approach: pure functions, so no database or AWS is needed. Valid inputs
check the cleaned-up value that gets stored. Invalid inputs are
parametrized and must raise a 400 HttpError that names the bad field.
"""

VALID_CA = {
    "street": "123 Main St",
    "city": "Vancouver",
    "province": "bc",
    "postalCode": "v6b1a1",
    "country": "ca",
}
SORTS = {"date": "t.work_date", "name": "e.last_name"}


# ---- numbers and strings ---------------------------------------------

def test_require_int_accepts_numeric_strings_and_whole_floats():
    """Path ids and query strings arrive as text and JSON may send 3.0;
    both must become a plain int."""
    assert require_int("42", "id") == 42
    assert require_int(3.0, "id") == 3


@pytest.mark.parametrize("value", [None, "", True, 3.5, "3.5", "abc"])
def test_require_int_rejects_non_integers(value):
    """True is rejected even though bool subclasses int in Python, so a
    JSON true can't slip through as id 1."""
    with pytest.raises(HttpError, match="id must be an integer"):
        require_int(value, "id")


@pytest.mark.parametrize("fn", [opt_int, opt_str, opt_date])
@pytest.mark.parametrize("empty", [None, ""])
def test_optional_validators_treat_blank_as_missing(fn, empty):
    """Optional fields left blank in a form become None instead of
    failing validation."""
    assert fn(empty, "field") is None


def test_opt_str_checks_a_filled_in_value():
    """A filled-in optional field gets the same trimming and length
    check as a required one."""
    assert opt_str("  Mei  ", "nickname", max_len=3) == "Mei"
    with pytest.raises(HttpError, match="nickname must be at most 3"):
        opt_str("Meiko", "nickname", max_len=3)


def test_require_str_trims_whitespace():
    """Names are stored without stray spaces from copy-paste."""
    assert require_str("  Mei  ", "firstName") == "Mei"


@pytest.mark.parametrize("value", [None, "", "   ", 5])
def test_require_str_rejects_missing_or_non_text(value):
    """A whitespace-only name counts as missing, and numbers are not
    silently turned into text."""
    with pytest.raises(HttpError, match="firstName is required"):
        require_str(value, "firstName")


def test_require_str_checks_length_after_trimming():
    """Padding spaces don't count toward max_len, but extra text does."""
    assert require_str("  abc  ", "code", max_len=3) == "abc"
    with pytest.raises(HttpError, match="at most 3 characters"):
        require_str("abcd", "code", max_len=3)


# ---- email and phone -------------------------------------------------

def test_require_email_trims_and_lowercases():
    """Emails are stored trimmed and lowercase, so the duplicate-email
    check and login lookups ignore case."""
    assert require_email("  Mei.Ross@Test.com ") == "mei.ross@test.com"


@pytest.mark.parametrize(
    "value",
    [None, "", "   ", "mei.ross", "mei@test", "mei ross@test.com", 42],
)
def test_require_email_rejects_invalid(value):
    """Missing values, no @, no dot in the domain, spaces and non-strings
    must all give a 400, never a 500."""
    with pytest.raises(HttpError) as err:
        require_email(value)
    assert err.value.status == 400


def test_phone_accepts_e164_number():
    """A valid +1 number is stored exactly as sent (no reformatting)."""
    assert phone_e164("+16045550142") == "+16045550142"


@pytest.mark.parametrize(
    "value",
    [
        "604-555-0142", "6045550142", "+1 604 555 0142",
        "+11045550142", "+16041550142", "+446045550142",
    ],
)
def test_phone_rejects_non_e164(value):
    """Rejects formatted numbers, area codes or exchanges starting with 1,
    and non-+1 country codes; the error shows the correct format."""
    with pytest.raises(HttpError, match="E.164") as err:
        phone_e164(value)
    assert err.value.status == 400


# ---- dates and times -------------------------------------------------

def test_require_date_parses_iso_date():
    """Dates come in as YYYY-MM-DD and become datetime.date objects."""
    assert require_date("2026-11-14", "from") == datetime.date(2026, 11, 14)


@pytest.mark.parametrize(
    "value", ["2026-02-30", "2026-13-01", "14/11/2026", "2026-1-5", None, 20261114]
)
def test_require_date_rejects_bad_dates(value):
    """2026-02-30 passes the YYYY-MM-DD pattern but isn't a real day; it
    must still be a 400, not a crash inside date.fromisoformat."""
    with pytest.raises(HttpError, match="from must be a date"):
        require_date(value, "from")


@pytest.mark.parametrize("value, expected", [
    ("09:00", datetime.time(9, 0)),
    ("23:59", datetime.time(23, 59)),
    ("09:00:30", datetime.time(9, 0, 30)),
])
def test_require_time_parses_hh_mm(value, expected):
    """Timesheet times come as HH:MM, with optional seconds."""
    assert require_time(value, "startTime") == expected


@pytest.mark.parametrize("value", ["24:00", "9:00", "09:60", "0900", None])
def test_require_time_rejects_bad_times(value):
    """Hours must be two digits from 00 to 23, so 24:00 and 9:00 are
    rejected rather than guessed at."""
    with pytest.raises(HttpError, match="must be a time"):
        require_time(value, "startTime")


# ---- choices and flags -----------------------------------------------

def test_one_of_is_case_sensitive_and_lists_options():
    """Lowercase "active" is rejected, and the 400 tells the caller which
    values are allowed."""
    assert one_of("ACTIVE", "status", ["ACTIVE", "DEACTIVATED"]) == "ACTIVE"
    with pytest.raises(HttpError, match="ACTIVE, DEACTIVATED"):
        one_of("active", "status", ["ACTIVE", "DEACTIVATED"])


def test_require_bool_true_accepts_true():
    """isDeleted: true is the only way to request a soft delete."""
    assert require_bool_true(True, "isDeleted") is True


@pytest.mark.parametrize("value", ["true", 1, False, None])
def test_require_bool_true_rejects_lookalikes(value):
    """The string "true" or the number 1 must not count as a delete
    request; only a real JSON true does."""
    with pytest.raises(HttpError, match="only accepts true"):
        require_bool_true(value, "isDeleted")


# ---- request parameters ----------------------------------------------

def test_path_id_reads_id_from_path():
    """/{id} path parameters arrive as text and are returned as an int."""
    assert path_id({"pathParameters": {"id": "17"}}) == 17


@pytest.mark.parametrize("event", [
    {},
    {"pathParameters": None},
    {"pathParameters": {"id": "abc"}},
])
def test_path_id_rejects_missing_or_non_numeric(event):
    """API Gateway sends pathParameters as null when there are none; that
    must be a 400, not an AttributeError."""
    with pytest.raises(HttpError, match="id must be an integer"):
        path_id(event)


def test_paging_defaults_and_custom_values():
    """No paging params means the first 50 rows; given values come back
    as ints."""
    assert paging({}) == (50, 0)
    assert paging({"limit": "200", "offset": "10"}) == (200, 10)


@pytest.mark.parametrize("q", [
    {"limit": "0"}, {"limit": "201"}, {"offset": "-1"}, {"limit": "abc"},
])
def test_paging_rejects_out_of_range(q):
    """Limit is capped at 200 so a single request can't pull a whole
    table, and offsets can't be negative."""
    with pytest.raises(HttpError) as err:
        paging(q)
    assert err.value.status == 400


def test_order_by_builds_clause():
    """Sort keys map to real columns; order is case-insensitive and
    defaults to ascending."""
    expected = "ORDER BY e.last_name DESC"
    assert order_by({"sort": "name", "order": "DESC"}, SORTS, "date") == expected
    assert order_by({}, SORTS, "date") == "ORDER BY t.work_date ASC"


@pytest.mark.parametrize("q", [
    {"sort": "salary; DROP TABLE employee"},
    {"order": "sideways"},
])
def test_order_by_rejects_unknown_values(q):
    """The result is pasted into SQL, so only allowlisted columns and
    asc/desc may get through (the SQL-injection guard)."""
    with pytest.raises(HttpError) as err:
        order_by(q, SORTS, "date")
    assert err.value.status == 400


# ---- bank numbers and addresses --------------------------------------

def test_digits_keeps_leading_zeros():
    """Bank institution numbers like 004 stay text so the leading zeros
    survive; ints are converted to text first."""
    assert digits("004", "institutionNo", [3]) == "004"
    assert digits(12345, "transitNo", [5]) == "12345"


@pytest.mark.parametrize("value", ["04", "0004", "00a", "", None])
def test_digits_rejects_wrong_length_or_non_digits(value):
    """Wrong lengths, letters and blanks are all a 400."""
    with pytest.raises(HttpError) as err:
        digits(value, "institutionNo", [3])
    assert err.value.status == 400


def test_digits_error_lists_allowed_lengths():
    """Fields with several valid lengths name all of them in the error."""
    with pytest.raises(HttpError, match="must be 7 or 12 digits"):
        digits("12345", "accountNo", [7, 12])


def test_address_normalises_canadian_address():
    """Country, province and postal code are uppercased and the postal
    code gets its space, so every stored address looks the same."""
    assert address(VALID_CA) == {
        "street": "123 Main St",
        "city": "Vancouver",
        "province": "BC",
        "postal_code": "V6B 1A1",
        "country": "CA",
    }


def test_address_accepts_us_zip_plus_four():
    """US addresses skip the Canadian province list and accept both
    5-digit and ZIP+4 postal codes."""
    us = {**VALID_CA, "province": "WA", "postalCode": "98101-1234", "country": "US"}
    assert address(us)["postal_code"] == "98101-1234"


@pytest.mark.parametrize("change, field", [
    ({"country": "MX"}, "address.country"),
    ({"province": "XX"}, "address.province"),
    ({"postalCode": "12345"}, "address.postalCode"),
    ({"country": "US", "province": "WA"}, "address.postalCode"),
    ({"street": ""}, "address.street"),
])
def test_address_rejects_invalid_field(change, field):
    """The error must name the exact bad field (e.g. address.postalCode),
    because the frontend shows that message to the user."""
    with pytest.raises(HttpError, match=field) as err:
        address({**VALID_CA, **change})
    assert err.value.status == 400


def test_address_must_be_an_object():
    """An address sent as one plain string gets a 400, instead of
    crashing on .get() with a 500."""
    with pytest.raises(HttpError, match="must be an object"):
        address("123 Main St, Vancouver")


def test_address_json_is_null_without_street():
    """Employees saved without an address get null in the API response,
    not an object full of nulls."""
    assert address_json({"street": None}) is None


def test_address_round_trips_through_api():
    """What the API returns (camelCase postalCode) can be sent straight
    back and is stored unchanged."""
    stored = address(VALID_CA)
    assert address(address_json(stored)) == stored
