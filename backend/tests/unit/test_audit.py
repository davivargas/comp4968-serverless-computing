import datetime
import decimal
import json
import sys
import types
import uuid

import pytest

from payroll_common.audit import audit, begin, discard, flush, set_sender

"""Unit tests for payroll_common.audit, which builds audit-log messages
and sends them to SQS only once the database transaction commits.

Approach: set_sender() swaps SQS for a list, so each test sees exactly
which batches would have been sent. The module keeps its state in
globals, so an autouse fixture resets it around every test. The real
SQS path is checked last, with a fake boto3 module.
"""

CTX = {"employee_id": 7, "name": "Mei Ross"}


@pytest.fixture(autouse=True)
def sent():
    """Captures every batch the module tries to send."""
    batches = []
    set_sender(batches.append)
    discard()
    yield batches
    discard()
    set_sender(None)


def messages(batches):
    return [json.loads(m) for batch in batches for m in batch]


# ---- message content -------------------------------------------------

def test_audit_outside_transaction_sends_immediately(sent):
    """With no open transaction there is nothing to wait for, so the
    message goes out in its own batch straight away."""
    audit(None, CTX, "team", 3, "INSERT", None, {"name": "Ops"})
    assert len(sent) == 1 and len(sent[0]) == 1


def test_audit_message_shape(sent):
    """Each message says who changed what and when, with old and new
    values; recordId is always a string."""
    audit(None, CTX, "team", 3, "UPDATE", {"name": "Ops"}, {"name": "IT"})
    [msg] = messages(sent)
    assert msg["table"] == "team" and msg["recordId"] == "3"
    assert msg["action"] == "UPDATE"
    assert msg["changedBy"] == 7 and msg["changedByName"] == "Mei Ross"
    assert msg["oldValues"] == {"name": "Ops"}
    assert msg["newValues"] == {"name": "IT"}
    uuid.UUID(msg["auditId"])
    changed_at = datetime.datetime.fromisoformat(msg["changedAt"])
    assert changed_at.tzinfo is not None


def test_audit_without_user_context(sent):
    """System jobs audit with ctx=None; changedBy is then null instead
    of crashing."""
    audit(None, None, "pay_period", 1, "INSERT", None, {"status": "OPEN"})
    [msg] = messages(sent)
    assert msg["changedBy"] is None and msg["changedByName"] is None


def test_audit_redacts_sensitive_fields(sent):
    """SIN, bank numbers, passwords and the Cognito sub never reach the
    audit log, in either old or new values."""
    old = {"sin": "123456789", "account_no": "1234567", "city": "Vancouver"}
    new = {"password": "reset", "cognito_sub": "abc", "transit_no": "12345",
           "institution_no": "004", "city": "Burnaby"}
    audit(None, CTX, "employee", 7, "UPDATE", old, new)
    [msg] = messages(sent)
    assert {**msg["oldValues"], **msg["newValues"]} == {
        "sin": "[REDACTED]", "account_no": "[REDACTED]",
        "password": "[REDACTED]", "cognito_sub": "[REDACTED]",
        "transit_no": "[REDACTED]", "institution_no": "[REDACTED]",
        "city": "Burnaby",
    }
    assert msg["oldValues"]["city"] == "Vancouver"


def test_audit_serialises_db_types(sent):
    """Decimal wages and dates from Postgres become JSON numbers and ISO
    strings instead of breaking json.dumps."""
    audit(None, CTX, "position_wage", 1, "INSERT", None,
          {"hourly_wage": decimal.Decimal("25.50"),
           "effective_from": datetime.date(2026, 1, 4)})
    [msg] = messages(sent)
    assert msg["newValues"] == {"hourly_wage": 25.5, "effective_from": "2026-01-04"}


def test_audit_serialises_other_types_as_text(sent):
    """Any other value json can't handle (e.g. a UUID) is stored as its
    text form instead of failing the audit."""
    ref = uuid.UUID(int=1)
    audit(None, CTX, "team", 1, "INSERT", None, {"ref": ref})
    [msg] = messages(sent)
    assert msg["newValues"] == {"ref": str(ref)}


# ---- transaction batching --------------------------------------------

def test_begin_holds_messages_until_flush(sent):
    """Inside a transaction nothing is sent until commit; then all of the
    transaction's messages go out together."""
    begin()
    audit(None, CTX, "team", 1, "INSERT", None, {})
    audit(None, CTX, "team", 2, "INSERT", None, {})
    assert sent == []
    flush()
    assert len(sent) == 1
    assert [m["recordId"] for m in messages(sent)] == ["1", "2"]


def test_discard_drops_messages_on_rollback(sent):
    """A rolled-back transaction must not leave audit entries for
    changes that never happened."""
    begin()
    audit(None, CTX, "team", 1, "INSERT", None, {})
    discard()
    flush()
    assert sent == []


def test_flush_ends_the_transaction(sent):
    """After commit, later audits are sent straight away again rather
    than piling up unsent."""
    begin()
    flush()
    audit(None, CTX, "team", 1, "INSERT", None, {})
    assert len(sent) == 1


def test_flush_with_nothing_pending_sends_nothing(sent):
    """Read-only transactions don't produce empty SQS batches."""
    begin()
    flush()
    assert sent == []


def test_flush_survives_send_failure(capsys):
    """The data is already committed, so an SQS failure is logged loudly
    but doesn't turn a successful request into an error."""
    def broken(batch):
        raise RuntimeError("SQS down")

    set_sender(broken)
    begin()
    audit(None, CTX, "team", 1, "INSERT", None, {})
    flush()
    assert "AUDIT WRITE FAILED" in capsys.readouterr().out


def test_missing_queue_url_fails_loudly(monkeypatch):
    """No sender and no AUDIT_QUEUE_URL means a misconfigured deploy;
    raising beats silently losing the audit trail."""
    set_sender(None)
    monkeypatch.delenv("AUDIT_QUEUE_URL", raising=False)
    with pytest.raises(RuntimeError, match="AUDIT_QUEUE_URL"):
        audit(None, CTX, "team", 1, "INSERT", None, {})


# ---- sending to SQS --------------------------------------------------

@pytest.fixture
def sqs(monkeypatch):
    """Fake boto3 whose SQS client records each send_message_batch call
    and answers with sqs["reply"]."""
    state = {"clients": [], "batches": [], "reply": {}}

    def send_message_batch(QueueUrl, Entries):
        state["batches"].append((QueueUrl, Entries))
        return state["reply"]

    def client(name):
        state["clients"].append(name)
        return types.SimpleNamespace(send_message_batch=send_message_batch)

    fake_boto3 = types.SimpleNamespace(client=client)
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    monkeypatch.setenv("AUDIT_QUEUE_URL", "https://sqs.test/audit")
    set_sender(None)
    return state


def test_sqs_sends_in_batches_of_ten(sqs):
    """SQS takes at most 10 messages per batch call, so a transaction
    with 23 audits is sent as 10 + 10 + 3."""
    begin()
    for n in range(23):
        audit(None, CTX, "team", n, "INSERT", None, {})
    flush()
    assert sqs["clients"] == ["sqs"]
    assert [len(entries) for _, entries in sqs["batches"]] == [10, 10, 3]
    assert {url for url, _ in sqs["batches"]} == {"https://sqs.test/audit"}
    url, first = sqs["batches"][0]
    assert [e["Id"] for e in first] == [str(n) for n in range(10)]
    assert json.loads(first[0]["MessageBody"])["recordId"] == "0"
