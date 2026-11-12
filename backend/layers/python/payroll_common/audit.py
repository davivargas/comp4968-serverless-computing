import datetime
import decimal

SENSITIVE = {"password", "account_no", "institution_no", "transit_no", "sin", "cognito_sub"}

_pending = []
_active = False


def _default(o):
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, (datetime.date, datetime.datetime, datetime.time)):
        return o.isoformat()
    return str(o)


def _redact(d):
    if d is None:
        return None
    return {k: ("[REDACTED]" if k in SENSITIVE else v) for k, v in d.items()}


def begin():
    global _active
    _pending.clear()
    _active = True


def discard():
    global _active
    _pending.clear()
    _active = False
