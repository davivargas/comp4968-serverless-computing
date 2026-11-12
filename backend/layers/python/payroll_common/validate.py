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
