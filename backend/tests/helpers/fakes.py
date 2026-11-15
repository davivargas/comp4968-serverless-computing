import contextlib
import copy

"""Shared fakes: a database that answers SQL by text fragment and a
Cognito client that records admin calls.

Both record everything they're asked to do, so tests can check what was
written or called, including that nothing was when a request is refused.
"""


def norm(sql):
    """Collapses whitespace so fragments match however SQL is laid out."""
    return " ".join(sql.split())


class FakeDB:
    """Stands in for one()/query()/transaction() and a pg8000 connection.
    Answers SQL by fragment (later rules win) and records every call."""

    def __init__(self):
        self.rules, self.errors = [], []
        self.calls = []
        self.executed = []
        self.commits = self.rollbacks = 0

    def on(self, fragment, rows, rowcount=None):
        """Answer SQL containing fragment with a dict, a list of rows, None
        (no rows) or a function of the params."""
        if rows is None:
            rows = []
        elif isinstance(rows, dict):
            rows = [rows]
        self.rules.insert(0, (fragment, rows, rowcount))

    def fail_on(self, fragment, error):
        """Make any statement containing fragment raise error."""
        self.errors.append((fragment, error))

    def run(self, sql, params=()):
        sql = norm(sql)
        self.calls.append((sql, params))
        for fragment, error in self.errors:
            if fragment in sql:
                raise error
        for fragment, rows, rowcount in self.rules:
            if fragment in sql:
                rows = rows(params) if callable(rows) else copy.deepcopy(rows)
                return rows, rowcount
        return [], None

    def one(self, conn, sql, params=()):
        rows, _ = self.run(sql, params)
        return rows[0] if rows else None

    def query(self, conn, sql, params=()):
        return self.run(sql, params)[0]

    @contextlib.contextmanager
    def transaction(self):
        try:
            yield self
        except BaseException:
            self.rollback()
            raise
        self.commit()

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def ran(self, fragment):
        """(sql, params) of every statement containing fragment."""
        return [(sql, p) for sql, p in self.calls if fragment in sql]

    def params(self, fragment):
        """Just the params of every statement containing fragment."""
        return [p for _, p in self.ran(fragment)]


class FakeCursor:
    """Cursor for FakeDB: statements also go to db.executed, and fetch
    results come from the matching rule."""

    def __init__(self, db):
        self.db, self.rows, self.rowcount = db, [], -1

    def execute(self, sql, params=None):
        self.db.executed.append((norm(sql), params))
        self.rows, count = self.db.run(sql, params)
        self.rowcount = len(self.rows) if count is None else count

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)

    def close(self):
        pass


class FakeCognito:
    """Records admin_* calls; new users get sub "sub-<Username>". Set
    errors[name] or errors[(name, username)] to make a call raise."""

    class exceptions:
        class UsernameExistsException(Exception):
            pass

    def __init__(self):
        self.calls = []
        self.errors = {}

    def __getattr__(self, name):
        if not name.startswith("admin_"):
            raise AttributeError(name)

        def call(**kwargs):
            self.calls.append((name, kwargs))
            user = kwargs.get("Username")
            error = self.errors.get((name, user)) or self.errors.get(name)
            if error:
                raise error
            if name == "admin_create_user":
                attrs = [{"Name": "sub", "Value": f"sub-{user}"}]
                return {"User": {"Attributes": attrs}}
            return {}
        return call

    def names(self):
        """The admin_* methods called, in order."""
        return [name for name, _ in self.calls]

    def kwargs(self, name):
        """The keyword arguments of every call to one method."""
        return [kw for n, kw in self.calls if n == name]

    def users(self, name):
        """The Username of every call to one method."""
        return [kw["Username"] for kw in self.kwargs(name)]
