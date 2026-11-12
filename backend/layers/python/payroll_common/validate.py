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
