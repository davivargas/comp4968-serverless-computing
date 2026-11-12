import datetime
import re

from .http_utils import HttpError


def bad(msg):
    raise HttpError(400, msg)


def require_int(v, name):
    if v is None or v == "" or isinstance(v, bool) or isinstance(v, float) and not v.is_integer():
        bad(f"{name} must be an integer")
    try:
        return int(v)
    except (ValueError, TypeError):
        bad(f"{name} must be an integer")


def opt_int(v, name):
    return None if v is None or v == "" else require_int(v, name)


def require_str(v, name, max_len=255):
    if not isinstance(v, str) or not v.strip():
        bad(f"{name} is required")
    if len(v.strip()) > max_len:
        bad(f"{name} must be at most {max_len} characters")
    return v.strip()


def opt_str(v, name, max_len=255):
    if v is None or v == "":
        return None
    return require_str(v, name, max_len)


def require_email(v, name="email"):
    s = require_str(v, name).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", s):
        bad(f"{name} is not a valid email")
    return s


def require_date(v, name):
    if not isinstance(v, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        bad(f"{name} must be a date (YYYY-MM-DD)")
    try:
        return datetime.date.fromisoformat(v)
    except ValueError:
        bad(f"{name} must be a date (YYYY-MM-DD)")


def opt_date(v, name):
    return None if v is None or v == "" else require_date(v, name)


def require_time(v, name):
    if not isinstance(v, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?", v):
        bad(f"{name} must be a time (HH:MM)")
    return datetime.time.fromisoformat(v if len(v) > 5 else v + ":00")


def one_of(v, name, options):
    if v not in options:
        bad(f"{name} must be one of: {', '.join(options)}")
    return v


def require_bool_true(v, name):
    if v is not True:
        bad(f"{name} only accepts true")
    return True


def path_id(event, name="id"):
    return require_int((event.get("pathParameters") or {}).get(name), name)


def paging(q, default_limit=50, max_limit=200):
    limit = require_int(q.get("limit", default_limit), "limit")
    offset = require_int(q.get("offset", 0), "offset")
    if limit < 1 or limit > max_limit:
        bad(f"limit must be between 1 and {max_limit}")
    if offset < 0:
        bad("offset must be >= 0")
    return limit, offset


def order_by(q, allowed, default_key):
    key = q.get("sort", default_key)
    if key not in allowed:
        bad(f"sort must be one of: {', '.join(allowed)}")
    direction = q.get("order", "asc").lower()
    if direction not in ("asc", "desc"):
        bad("order must be asc or desc")
    return f"ORDER BY {allowed[key]} {direction.upper()}"


def digits(v, name, lengths):
    s = require_str(str(v) if v is not None else None, name)
    if not re.fullmatch(r"\d+", s) or len(s) not in lengths:
        bad(f"{name} must be {' or '.join(str(x) for x in lengths)} digits")
    return s


def phone_e164(v, name="phone"):
    s = require_str(v, name, 20)
    if not re.fullmatch(r"\+1[2-9]\d{2}[2-9]\d{6}", s):
        bad(f"{name} must be a valid Canadian or US number in E.164 format, e.g. +16045550142")
    return s
