import base64
import datetime
import decimal
import json
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


def response(status, body):
    return {"statusCode": status, "headers": _headers(), "body": json.dumps(body, default=_default)}


def created(body):
    return response(201, body)


def no_content():
    return {"statusCode": 204, "headers": _headers(), "body": ""}


def parse_body(event):
    raw = event.get("body")
    if not raw:
        return {}
    try:
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8")
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("not an object")
        return data
    except Exception:
        raise HttpError(400, "Request body must be a JSON object")
