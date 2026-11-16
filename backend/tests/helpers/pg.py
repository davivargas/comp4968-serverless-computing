import pg8000.dbapi

from payroll_common.db import one

"""Helpers for tests that talk to the real Postgres in tests/db.

connect() opens a pg8000 connection like the Lambdas do (minus SSL),
insert() adds one row and returns it, and sqlstate() reads the error
code Postgres sent, e.g. 23505 for a unique violation.
"""

UNIQUE = "23505"
CHECK = "23514"
FOREIGN_KEY = "23503"


def connect(server, database):
    """A plain pg8000 connection to one database on the test server."""
    return pg8000.dbapi.connect(database=database, **server)


def run_script(conn, path):
    """Runs a whole .sql file in one go, the way db-init does."""
    cur = conn.cursor()
    try:
        cur.execute(path.read_text("utf-8"))
    finally:
        cur.close()


def insert(conn, table, **cols):
    """INSERTs one row and returns it with its generated columns."""
    names = ", ".join(cols)
    marks = ", ".join(["%s"] * len(cols))
    sql = f"INSERT INTO {table} ({names}) VALUES ({marks}) RETURNING *"
    return one(conn, sql, list(cols.values()))


def sqlstate(error):
    """The SQLSTATE code of a pg8000 database error."""
    return error.args[0]["C"]
