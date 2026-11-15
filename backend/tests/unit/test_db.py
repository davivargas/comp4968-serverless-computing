import json
import ssl
import sys
import types

import pytest

from payroll_common import audit, db

"""Unit tests for payroll_common.db: connection settings, reusing one
connection across warm Lambda invocations, row helpers and transactions.

Approach: pg8000.dbapi.connect (and boto3, for the secret) are replaced
with small pg8000-shaped fakes, so no database or AWS is needed. db keeps
its connection in a global, so a fixture clears it around every test.
"""

CTX = {"employee_id": 7, "name": "Mei Ross"}
DB_VARS = ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
           "DB_SECRET_ARN", "DB_HOST", "DB_NAME", "DB_SSL")


class PgCursor:
    """Minimal pg8000 cursor; results come from its connection."""

    def __init__(self, conn):
        self.conn, self.description, self.rows = conn, None, []

    def execute(self, sql, params=()):
        self.conn.statements.append((sql, params))
        if self.conn.broken:
            raise ConnectionError("server closed the connection")
        self.description, self.rows = self.conn.result

    def fetchall(self):
        return self.rows

    def close(self):
        self.conn.cursors_closed += 1


class PgConn:
    """Minimal pg8000 connection that records what happens to it."""

    def __init__(self, columns=None, rows=()):
        self.result = (columns, list(rows))
        self.statements = []
        self.broken = self.fail_commit = False
        self.fail_rollback = self.fail_close = False
        self.commits = self.rollbacks = self.cursors_closed = 0
        self.closed = False

    def cursor(self):
        return PgCursor(self)

    def commit(self):
        if self.fail_commit:
            raise RuntimeError("commit failed")
        self.commits += 1

    def rollback(self):
        if self.fail_rollback:
            raise OSError("connection gone")
        self.rollbacks += 1

    def close(self):
        if self.fail_close:
            raise OSError("already closed")
        self.closed = True


def columns(*names):
    return [(name,) for name in names]


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    """No cached connection and no DB settings from the real env."""
    monkeypatch.setattr(db, "_conn", None)
    for var in DB_VARS:
        monkeypatch.delenv(var, raising=False)


@pytest.fixture
def connects(monkeypatch):
    """Replaces pg8000's connect; each call returns a new PgConn and its
    keyword arguments are recorded."""
    calls = []

    def connect(**kwargs):
        calls.append(kwargs)
        return PgConn()

    monkeypatch.setattr(db.pg8000.dbapi, "connect", connect)
    return calls


@pytest.fixture
def secret(monkeypatch):
    """Fake boto3 whose Secrets Manager returns secret["value"]. It is
    put in sys.modules only for this test (monkeypatch restores it)."""
    holder = {"value": {}, "ids": []}

    def get_secret_value(SecretId):
        holder["ids"].append(SecretId)
        return {"SecretString": json.dumps(holder["value"])}

    client = types.SimpleNamespace(get_secret_value=get_secret_value)
    fake_boto3 = types.SimpleNamespace(client=lambda service: client)
    monkeypatch.setitem(sys.modules, "boto3", fake_boto3)
    return holder


# ---- connection settings ---------------------------------------------

def test_config_from_pg_env_vars(monkeypatch):
    """Locally the standard PG* variables are used; port defaults to
    5432."""
    monkeypatch.setenv("PGHOST", "localhost")
    monkeypatch.setenv("PGDATABASE", "payroll")
    monkeypatch.setenv("PGUSER", "app")
    monkeypatch.setenv("PGPASSWORD", "pw")
    assert db._config() == ("localhost", 5432, "payroll", "app", "pw")


def test_config_from_secrets_manager(monkeypatch, secret):
    """In AWS, DB_SECRET_ARN wins over PG* vars: credentials come from
    the secret, while DB_HOST and DB_NAME can still override."""
    monkeypatch.setenv("PGHOST", "ignored")
    monkeypatch.setenv("DB_SECRET_ARN", "arn:db-secret")
    secret["value"] = {"host": "rds.internal", "port": 6543, "dbname": "prod",
                       "username": "admin", "password": "s3cret"}
    assert db._config() == ("rds.internal", 6543, "prod", "admin", "s3cret")
    assert secret["ids"] == ["arn:db-secret"]
    monkeypatch.setenv("DB_HOST", "proxy.internal")
    monkeypatch.setenv("DB_NAME", "payroll")
    assert db._config()[:3] == ("proxy.internal", 6543, "payroll")


def test_config_secret_defaults(monkeypatch, secret):
    """A secret without port or dbname falls back to 5432 / payroll."""
    monkeypatch.setenv("DB_SECRET_ARN", "arn:db-secret")
    secret["value"] = {"host": "rds", "username": "u", "password": "p"}
    assert db._config() == ("rds", 5432, "payroll", "u", "p")


# ---- get_conn --------------------------------------------------------

def test_get_conn_uses_ssl_by_default(connects):
    """Connections are encrypted unless DB_SSL=disable; the server
    certificate itself isn't checked."""
    db.get_conn()
    ctx = connects[0]["ssl_context"]
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_NONE and ctx.check_hostname is False


def test_get_conn_ssl_can_be_disabled(connects, monkeypatch):
    """DB_SSL=disable is for a local Postgres without TLS."""
    monkeypatch.setenv("DB_SSL", "disable")
    db.get_conn()
    assert connects[0]["ssl_context"] is None


def test_get_conn_reuses_a_healthy_connection(connects):
    """Warm invocations reuse the cached connection after a SELECT 1
    check, rolled back so no open transaction carries over."""
    first = db.get_conn()
    second = db.get_conn()
    assert second is first and len(connects) == 1
    assert first.statements == [("SELECT 1", ())]
    assert first.rollbacks == 1


@pytest.mark.parametrize("close_fails", [False, True])
def test_get_conn_replaces_a_dead_connection(connects, close_fails):
    """If the check fails (e.g. RDS dropped an idle connection) a new one
    is opened, even when closing the old one also fails."""
    first = db.get_conn()
    first.broken, first.fail_close = True, close_fails
    second = db.get_conn()
    assert second is not first and len(connects) == 2
    assert first.closed is not close_fails


# ---- query and one ---------------------------------------------------

def test_query_returns_rows_as_dicts():
    """Rows come back as dicts keyed by column name, and the cursor is
    closed afterwards."""
    conn = PgConn(columns("id", "name"), [(1, "Ops"), (2, "IT")])
    rows = db.query(conn, "SELECT id, name FROM team")
    assert rows == [{"id": 1, "name": "Ops"}, {"id": 2, "name": "IT"}]
    assert conn.cursors_closed == 1


def test_query_without_result_set_is_empty():
    """Statements that return nothing (UPDATE without RETURNING) give []
    instead of failing on a missing description."""
    conn = PgConn()
    assert db.query(conn, "UPDATE team SET name = %s", ("Ops",)) == []
    assert conn.statements == [("UPDATE team SET name = %s", ("Ops",))]


def test_query_closes_cursor_on_error():
    """A failing statement still closes its cursor before raising."""
    conn = PgConn()
    conn.broken = True
    with pytest.raises(ConnectionError):
        db.query(conn, "SELECT 1")
    assert conn.cursors_closed == 1


def test_one_returns_first_row_or_none():
    """one() is for single-row lookups: the first row, or None."""
    conn = PgConn(columns("n"), [(5,), (6,)])
    assert db.one(conn, "SELECT n FROM t") == {"n": 5}
    conn.result = (columns("n"), [])
    assert db.one(conn, "SELECT n FROM t") is None


# ---- transaction -----------------------------------------------------

@pytest.fixture
def tx(monkeypatch):
    """A PgConn behind get_conn; each audit batch is recorded with the
    commit count at send time, to check ordering."""
    conn = PgConn()
    sent = []
    monkeypatch.setattr(db, "get_conn", lambda: conn)
    audit.set_sender(lambda batch: sent.append((conn.commits, batch)))
    yield conn, sent
    audit.set_sender(None)
    audit.discard()


def test_transaction_commits_then_sends_audit(tx):
    """On success the work is committed first; only then are the audit
    messages sent, together in one batch."""
    conn, sent = tx
    with db.transaction() as c:
        assert c is conn
        audit.audit(c, CTX, "team", 1, "INSERT", None, {})
        audit.audit(c, CTX, "team", 2, "INSERT", None, {})
        assert sent == []
    assert conn.commits == 1
    [(commits_at_send, batch)] = sent
    assert commits_at_send == 1 and len(batch) == 2


def test_transaction_error_rolls_back_and_drops_audit(tx):
    """An error inside the block rolls back, drops the pending audit
    messages and re-raises."""
    conn, sent = tx
    with pytest.raises(ValueError):
        with db.transaction() as c:
            audit.audit(c, CTX, "team", 1, "INSERT", None, {})
            raise ValueError("bad input")
    assert conn.rollbacks == 1 and conn.commits == 0 and sent == []


def test_transaction_failed_commit_is_not_success(tx):
    """If COMMIT itself fails, nothing is audited and the error reaches
    the caller instead of a false success."""
    conn, sent = tx
    conn.fail_commit = True
    with pytest.raises(RuntimeError, match="commit failed"):
        with db.transaction() as c:
            audit.audit(c, CTX, "team", 1, "INSERT", None, {})
    assert conn.rollbacks == 1 and sent == []


def test_transaction_rollback_error_keeps_original_error(tx):
    """If the rollback fails too (connection gone), the caller still
    sees the original error, not the rollback one."""
    conn, sent = tx
    conn.fail_rollback = True
    with pytest.raises(ValueError, match="bad input"):
        with db.transaction():
            raise ValueError("bad input")
    assert sent == []
