import datetime
import decimal
import json
import os
import uuid

SENSITIVE = {"password", "account_no", "institution_no", "transit_no", "sin", "cognito_sub"}

_pending = []
_active = False
_sender = None


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


def set_sender(fn):
    global _sender
    _sender = fn


def _send(messages):
    if _sender is not None:
        return _sender(messages)
    url = os.environ.get("AUDIT_QUEUE_URL")
    if not url:
        raise RuntimeError("AUDIT_QUEUE_URL is not set")
    import boto3
    sqs = boto3.client("sqs")
    for i in range(0, len(messages), 10):
        chunk = messages[i:i + 10]
        out = sqs.send_message_batch(QueueUrl=url, Entries=[{"Id": str(n), "MessageBody": m} for n, m in enumerate(chunk)])
        if out.get("Failed"):
            raise RuntimeError(f"SQS rejected {len(out['Failed'])} audit message(s)")


def begin():
    global _active
    _pending.clear()
    _active = True


def discard():
    global _active
    _pending.clear()
    _active = False


def flush():
    global _active
    _active = False
    messages = list(_pending)
    _pending.clear()
    if not messages:
        return
    try:
        _send(messages)
    except Exception:
        import traceback
        print("AUDIT WRITE FAILED - these changes are committed but not logged:", messages)
        traceback.print_exc()


def audit(conn, ctx, table, record_id, action, old_values, new_values):
    event = {
        "auditId": str(uuid.uuid4()),
        "table": table,
        "recordId": str(record_id),
        "action": action,
        "changedBy": ctx["employee_id"] if ctx else None,
        "changedByName": ctx["name"] if ctx else None,
        "changedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="microseconds"),
        "oldValues": _redact(old_values),
        "newValues": _redact(new_values),
    }
    body = json.dumps(event, default=_default)
    if _active:
        _pending.append(body)
    else:
        _send([body])
