import datetime
import itertools
import types

import pytest

from helpers.lambdas import DB_DIR
from helpers.pg import connect, insert, run_script
from payroll_common import audit, db

"""Fixtures for the tests in tests/db, which run the real SQL against a
real Postgres 16 (the RDS version in template.yaml).

Approach: the first test that needs a database starts one throwaway
Docker container and loads schema.sql into a template database. Each
test then gets its own copy of it (CREATE DATABASE ... TEMPLATE takes
milliseconds), so tests can commit without affecting each other. The
container is removed when pytest exits. Without Docker, these tests
are skipped and the rest of the suite still runs.
"""

IMAGE = "postgres:16-alpine"
TEMPLATE = "payroll_template"
_ids = itertools.count(1)


def _docker_is_running():
    """True if the Docker daemon answers a ping."""
    try:
        import docker
        return docker.from_env().ping()
    except Exception:
        return False


def _execute(conn, sql):
    cur = conn.cursor()
    try:
        cur.execute(sql)
    finally:
        cur.close()


@pytest.fixture(scope="session")
def postgres():
    """One Postgres container for the whole run, with schema.sql loaded
    into a template database. Yields (server settings, admin conn)."""
    if not _docker_is_running():
        pytest.skip("Docker is not running; start Docker Desktop to run "
                    "the database tests")
    from testcontainers.community.postgres import PostgresContainer
    container = PostgresContainer(IMAGE, driver=None).start()
    try:
        host = container.get_container_host_ip().replace("localhost",
                                                           "127.0.0.1")
        server = {"host": host,
                  "port": int(container.get_exposed_port(5432)),
                  "user": container.username,
                  "password": container.password}
        admin = connect(server, container.dbname)
        admin.autocommit = True
        _execute(admin, f"CREATE DATABASE {TEMPLATE}")
        template = connect(server, TEMPLATE)
        run_script(template, DB_DIR / "schema.sql")
        template.commit()
        template.close()
        yield server, admin
        admin.close()
    finally:
        container.stop()


@pytest.fixture
def make_db(postgres, monkeypatch):
    """Creates fresh databases for one test and points payroll_common's
    shared connection at the newest one. All are dropped afterwards."""
    server, admin = postgres
    made = []

    def make(schema=True):
        name = f"test_{next(_ids)}"
        template = f" TEMPLATE {TEMPLATE}" if schema else ""
        _execute(admin, f"CREATE DATABASE {name}{template}")
        conn = connect(server, name)
        made.append((name, conn))
        monkeypatch.setattr(db, "_conn", conn)
        return conn

    yield make
    for name, conn in made:
        conn.close()
        _execute(admin, f"DROP DATABASE {name} WITH (FORCE)")


@pytest.fixture
def conn(make_db):
    """A connection to a fresh database with schema.sql loaded."""
    return make_db()


@pytest.fixture
def empty_conn(make_db):
    """A connection to a fresh database with no tables at all."""
    return make_db(schema=False)


@pytest.fixture(autouse=True)
def audits():
    """Collects audit messages instead of sending them to SQS."""
    sent = []
    audit.set_sender(lambda batch: sent.extend(batch))
    audit.discard()
    yield sent
    audit.discard()
    audit.set_sender(None)


@pytest.fixture
def base(conn):
    """A small committed company: an IT admin, a manager, her team, a
    $25/h developer on that team, project 1001 and the 3 special
    projects. Returns their ids."""
    def position(title, wage):
        p = insert(conn, "position", title=title, pay_grade="G1")
        return p["position_id"], wage

    def person(first, sub, position_id, role_id=None, team_id=None,
               hire=datetime.date(2020, 1, 1)):
        return insert(conn, "employee", cognito_sub=sub, first_name=first,
                      last_name="Test", email=f"{first.lower()}@test.com",
                      role_id=role_id, position_id=position_id,
                      team_id=team_id, hire_date=hire)["employee_id"]

    wages = [position("IT Administrator", 40), position("Engineering Manager", 50),
             position("Developer", 25)]
    (it_pos, _), (mgr_pos, _), (dev_pos, _) = wages
    admin = person("Ivy", "sub-ivy", it_pos, role_id=3)
    for position_id, wage in wages:
        insert(conn, "position_wage", position_id=position_id, hourly_wage=wage,
               effective_from=datetime.date(2000, 1, 1), created_by=admin)
    mei = person("Mei", "sub-mei", mgr_pos, role_id=1)
    team = insert(conn, "team", name="Platform", manager_id=mei)["team_id"]
    ana = person("Ana", "sub-ana", dev_pos, team_id=team,
                 hire=datetime.date(2025, 6, 1))
    project = insert(conn, "project", project_code=1001, name="Payroll app",
                     created_by=admin)["project_id"]
    special = {}
    for code, name, kind in [(9001, "Sick day", "SICK"),
                             (9002, "Vacation day", "VAC"),
                             (9003, "Miscellaneous", "MISC")]:
        special[kind] = insert(conn, "project", project_code=code, name=name,
                               special_type=kind,
                               created_by=admin)["project_id"]
    conn.commit()
    return types.SimpleNamespace(admin=admin, mei=mei, ana=ana, team=team,
                                 dev_position=dev_pos, project=project,
                                 sick=special["SICK"], vac=special["VAC"])
