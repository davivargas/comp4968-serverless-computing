import datetime
import decimal
import os


class HttpError(Exception):
    def __init__(self, status, message, details=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details


def _default(o):
    if isinstance(o, decimal.Decimal):
        return float(o)
    if isinstance(o, datetime.datetime):
        return o.isoformat()
    if isinstance(o, datetime.time):
        return o.strftime("%H:%M")
    if isinstance(o, datetime.date):
        return o.isoformat()
    raise TypeError(f"not serializable: {type(o)}")


def _headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": os.environ.get("CORS_ORIGIN", "*"),
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Active-Role",
    }
