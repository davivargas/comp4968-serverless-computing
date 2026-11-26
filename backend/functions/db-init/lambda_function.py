import csv
import datetime
import json
import os

import boto3

from payroll_common import payroll as pr
from payroll_common.db import get_conn, one, query
from payroll_common.http_utils import HttpError
from payroll_common.release import release_period
from payroll_common.validate import one_of, require_email, require_str

SPECIAL_PROJECTS = [(9001, "Sick day", "SICK"), (9002, "Vacation day", "VAC"), (9003, "Miscellaneous", "MISC")]

_cognito = None


def cognito():
    global _cognito
    if _cognito is None:
        _cognito = boto3.client("cognito-idp")
    return _cognito


def _exists(conn, table):
    return one(conn, "SELECT to_regclass(%s) IS NOT NULL AS ok", (f"public.{table}",))["ok"]


def _column_exists(conn, table, column):
    return bool(one(conn, """SELECT 1 AS x FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s AND column_name = %s""",
                    (table, column)))


def load_schema():
    conn = get_conn()
    if _exists(conn, "employee"):
        return {"ok": False, "message": "The schema is already loaded; nothing was changed."}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")
    with open(path, encoding="utf-8") as f:
        script = f.read()
    cur = conn.cursor()
    try:
        cur.execute(script)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cur.close()
    tables = one(conn, "SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = 'public'")["n"]
    conn.rollback()
    return {"ok": True, "message": "Schema loaded.", "tables": tables}


def migrate_schema():
    conn = get_conn()
    if not _exists(conn, "employee"):
        return {"ok": False, "message": "Load the schema first (action: schema)."}
    had_auditor = _exists(conn, "auditor")
    with open(_here("migrate.sql"), encoding="utf-8") as f:
        script = f.read()
    cur = conn.cursor()
    try:
        cur.execute(script)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cur.close()
    return {"ok": True, "message": "Database is up to date.", "auditorTableAdded": not had_auditor}


def ensure_special_projects(cur, created_by):
    cur.execute("SELECT project_code FROM project WHERE special_type IS NULL AND project_code BETWEEN 9001 AND 9003")
    clash = [r[0] for r in cur.fetchall()]
    if clash:
        raise ValueError(f"Project code(s) {clash} are already used by normal projects; change them before running this.")
    for code, name, kind in SPECIAL_PROJECTS:
        cur.execute("""INSERT INTO project (project_code, name, special_type, created_by)
                       SELECT %s, %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM project WHERE special_type = %s)""",
                    (code, name, kind, created_by, kind))


def seed_admin(event):
    email = require_email(event.get("email"))
    first = require_str(event.get("firstName"), "firstName", 100)
    last = require_str(event.get("lastName"), "lastName", 100)
    conn = get_conn()
    if not _exists(conn, "employee"):
        return {"ok": False, "message": "Load the schema first (action: schema)."}
    if one(conn, "SELECT 1 AS x FROM employee LIMIT 1"):
        conn.rollback()
        return {"ok": False, "message": "An employee already exists; the first admin can only be created on an empty database."}
    pool = os.environ["USER_POOL_ID"]
    try:
        out = cognito().admin_create_user(
            UserPoolId=pool, Username=email, DesiredDeliveryMediums=["EMAIL"],
            UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"},
                            {"Name": "given_name", "Value": first}, {"Name": "family_name", "Value": last}])
    except cognito().exceptions.UsernameExistsException:
        return {"ok": False, "message": "That email already exists in the user pool. Delete it there first or use another email."}
    sub = next(a["Value"] for a in out["User"]["Attributes"] if a["Name"] == "sub")
    try:
        cur = conn.cursor()
        cur.execute("INSERT INTO position (title, pay_grade) VALUES ('IT Administrator', 'G1') RETURNING position_id")
        position_id = cur.fetchone()[0]
        cur.execute("""INSERT INTO employee (cognito_sub, first_name, last_name, email, role_id, position_id, hire_date)
                       VALUES (%s, %s, %s, %s, 3, %s, %s) RETURNING employee_id""",
                    (sub, first, last, email, position_id, datetime.date.today()))
        employee_id = cur.fetchone()[0]
        cur.execute("""INSERT INTO position_wage (position_id, hourly_wage, effective_from, created_by)
                       VALUES (%s, 40.00, DATE '2000-01-01', %s)""", (position_id, employee_id))
        ensure_special_projects(cur, employee_id)
        cur.close()
        conn.commit()
    except BaseException:
        try:
            conn.rollback()
        except Exception:
            pass
        try:
            cognito().admin_delete_user(UserPoolId=pool, Username=email)
        except Exception as e:
            print("Cognito cleanup failed", e)
        raise
    return {"ok": True, "message": "First IT admin created; the invite email has been sent.", "employeeId": employee_id, "email": email}


DEMO_PASSWORD = "testAdmin1234"


class _Abort(Exception):
    pass


def _here(name):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), name)


def _manifest():
    with open(_here("demo_manifest.json"), encoding="utf-8") as f:
        return json.load(f)


def _delete_users(pool, emails):
    for email in emails:
        try:
            cognito().admin_delete_user(UserPoolId=pool, Username=email)
        except Exception as e:
            print("Cognito cleanup failed", email, e)


def _load_timesheet_csv(cur):
    rows = []
    with open(_here("demo_timesheets.csv"), encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            rows.append((r["email"], int(r["project_code"]), datetime.date.fromisoformat(r["work_date"]),
                         datetime.time.fromisoformat(r["start_time"]), datetime.time.fromisoformat(r["end_time"]), r["status"],
                         datetime.datetime.strptime(r["submitted_at"], "%Y-%m-%d %H:%M") if r["submitted_at"] else None,
                         datetime.datetime.strptime(r["reviewed_at"], "%Y-%m-%d %H:%M") if r["reviewed_at"] else None))
    cur.execute("""CREATE TEMP TABLE demo_ts (email text, code int, d date, a time, b time, st text, sub timestamp, rev timestamp)
                   ON COMMIT DROP""")
    for i in range(0, len(rows), 400):
        chunk = rows[i:i + 400]
        cur.execute("INSERT INTO demo_ts VALUES " + ",".join(["(%s,%s,%s,%s,%s,%s,%s,%s)"] * len(chunk)), [v for r in chunk for v in r])
    cur.execute("""INSERT INTO timesheet_entry (employee_id, project_id, work_date, start_time, end_time, submitted, submitted_at,
                                                approved, reviewed_by, reviewed_at)
                   SELECT e.employee_id, pr.project_id, v.d, v.a, v.b, v.st IN ('approved', 'submitted'),
                          CASE WHEN v.st IN ('approved', 'submitted') THEN v.sub AT TIME ZONE 'America/Vancouver' END,
                          v.st = 'approved', CASE WHEN v.st = 'approved' THEN t.manager_id END,
                          CASE WHEN v.st = 'approved' THEN v.rev AT TIME ZONE 'America/Vancouver' END
                     FROM demo_ts v JOIN employee e ON e.email = v.email JOIN project pr ON pr.project_code = v.code
                     JOIN team t ON t.team_id = e.team_id""")
    if cur.rowcount != len(rows):
        raise _Abort(f"Only {cur.rowcount} of {len(rows)} timesheet rows matched an employee and project; nothing was changed.")
    return len(rows)


def load_demo(event):
    conn = get_conn()
    if not _exists(conn, "employee"):
        return {"ok": False, "message": "Load the schema first (action: schema)."}
    ready = _exists(conn, "stat_holiday") and _column_exists(conn, "project", "special_type")
    if ready:
        ready = one(conn, "SELECT count(*)::int AS n FROM project WHERE special_type IS NOT NULL")["n"] == len(SPECIAL_PROJECTS)
    if not ready:
        conn.rollback()
        return {"ok": False, "message": "The database is missing the sick/vacation/misc projects or the stat holiday table. Load the schema and create the first admin first."}
    if not one(conn, "SELECT 1 AS x FROM employee LIMIT 1"):
        conn.rollback()
        return {"ok": False, "message": "Create the first admin first (action: seed)."}
    manifest = _manifest()
    if one(conn, "SELECT 1 AS x FROM team WHERE name = %s LIMIT 1", (manifest["teams"][0],)):
        conn.rollback()
        return {"ok": False, "message": "The demo data is already loaded; nothing was changed. Use {\"action\":\"reset\"} to remove it first."}
    manager_email = event.get("managerEmail")
    manager_id = None
    if manager_email:
        manager_email = require_email(manager_email)
        row = one(conn, "SELECT e.employee_id FROM employee e JOIN role r ON r.role_id = e.role_id WHERE e.email = %s AND r.name = 'MANAGER'", (manager_email,))
        if not row:
            conn.rollback()
            return {"ok": False, "message": "managerEmail must belong to an existing user with the Manager role."}
        manager_id = row["employee_id"]
    password = event.get("testPassword") or DEMO_PASSWORD
    last_employee = one(conn, "SELECT coalesce(max(employee_id), 0)::int AS n FROM employee")["n"]
    last_team = one(conn, "SELECT coalesce(max(team_id), 0)::int AS n FROM team")["n"]
    with open(_here("demo_data.sql"), encoding="utf-8") as f:
        script = f.read()
    pool = os.environ["USER_POOL_ID"]
    created = []
    cur = conn.cursor()
    try:
        cur.execute(script)
        entries = _load_timesheet_csv(cur)
        if manager_id:
            cur.execute("UPDATE team SET manager_id = %s WHERE team_id > %s", (manager_id, last_team))
        cur.execute("SELECT employee_id, email, first_name, last_name FROM employee WHERE employee_id > %s ORDER BY employee_id", (last_employee,))
        people = cur.fetchall()
        for employee_id, email, first, last in people:
            try:
                out = cognito().admin_create_user(
                    UserPoolId=pool, Username=email, MessageAction="SUPPRESS",
                    UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"},
                                    {"Name": "given_name", "Value": first}, {"Name": "family_name", "Value": last}])
            except cognito().exceptions.UsernameExistsException:
                raise _Abort(f"{email} already exists in the user pool. Delete it there first; nothing was changed.")
            created.append(email)
            cognito().admin_set_user_password(UserPoolId=pool, Username=email, Password=password, Permanent=True)
            sub = next(a["Value"] for a in out["User"]["Attributes"] if a["Name"] == "sub")
            cur.execute("UPDATE employee SET cognito_sub = %s WHERE employee_id = %s", (sub, employee_id))
        cur.close()
        pr.ensure_periods(conn, pr.today_bc())
        releaser = one(conn, "SELECT employee_id, first_name || ' ' || last_name AS name FROM employee WHERE role_id = 2 AND employee_id > %s ORDER BY employee_id LIMIT 1", (last_employee,))
        periods = query(conn, """SELECT pay_period_id, start_date FROM pay_period pp
                                  WHERE end_date < %s AND status = 'OPEN'
                                    AND EXISTS (SELECT 1 FROM timesheet_entry t WHERE NOT t.is_deleted AND t.employee_id > %s
                                                 AND t.work_date BETWEEN pp.start_date AND pp.end_date)
                                  ORDER BY start_date""", (datetime.date.fromisoformat(manifest["release_before"]), last_employee))
        for per in periods:
            try:
                release_period(conn, per["pay_period_id"], releaser, write_audit=False)
            except HttpError as e:
                raise _Abort(f"Could not release the pay period starting {per['start_date']}: {e.message}. Nothing was changed.")
        conn.commit()
    except _Abort as e:
        conn.rollback()
        _delete_users(pool, created)
        return {"ok": False, "message": str(e)}
    except BaseException:
        conn.rollback()
        _delete_users(pool, created)
        raise
    finally:
        try:
            cur.close()
        except Exception:
            pass
    counts = one(conn, """SELECT (SELECT count(*) FROM team)::int AS teams, (SELECT count(*) FROM project WHERE special_type IS NULL)::int AS projects,
                                 (SELECT count(*) FROM timesheet_entry)::int AS timesheet_entries,
                                 (SELECT count(*) FROM paystub)::int AS pay_stubs,
                                 (SELECT count(*) FROM direct_deposit)::int AS direct_deposits""")
    conn.rollback()
    return {"ok": True, "message": "Demo data loaded. Every demo person can sign in with the test password.",
            "employees": len(people), "csvTimesheetRows": entries, "releasedPayPeriods": len(periods), **counts, "managerEmail": manager_email}


def reset_demo(event):
    conn = get_conn()
    if not _exists(conn, "employee"):
        return {"ok": False, "message": "Load the schema first (action: schema)."}
    manifest = _manifest()
    ids = [r["employee_id"] for r in query(conn, "SELECT employee_id FROM employee WHERE email = ANY(%s)", (manifest["emails"],))]
    if not ids:
        conn.rollback()
        return {"ok": False, "message": "No demo people were found; nothing to reset."}
    preview = one(conn, """SELECT %s::int AS demo_people,
                                  (SELECT count(*) FROM timesheet_entry WHERE employee_id = ANY(%s))::int AS timesheet_entries,
                                  (SELECT count(*) FROM paystub WHERE employee_id = ANY(%s))::int AS demo_pay_stubs,
                                  (SELECT count(*) FROM paystub WHERE NOT employee_id = ANY(%s))::int AS other_pay_stubs,
                                  (SELECT count(*) FROM pay_period WHERE status = 'RELEASED')::int AS released_pay_periods""",
                   (len(ids), ids, ids, ids))
    others_in_teams = [r["email"] for r in query(conn, """SELECT e.email FROM employee e JOIN team t ON t.team_id = e.team_id
                                                         WHERE t.name = ANY(%s) AND NOT e.employee_id = ANY(%s) ORDER BY e.email""",
                                                 (manifest["teams"], ids))]
    conn.rollback()
    if preview["other_pay_stubs"]:
        return {"ok": False, "message": "Pay stubs exist for people who are not demo people, so nothing can be reset safely.", **preview}
    if others_in_teams:
        return {"ok": False, "message": f"{len(others_in_teams)} user(s) who are not demo people belong to the demo teams. Move them to another team first: {', '.join(others_in_teams)}", **preview}
    if event.get("confirm") is not True:
        return {"ok": True, "preview": True, "message": "Nothing was changed. Run again with \"confirm\": true to delete the demo data.", **preview}
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM paystub_earning WHERE paystub_id IN (SELECT paystub_id FROM paystub WHERE employee_id = ANY(%s))", (ids,))
        cur.execute("DELETE FROM paystub WHERE employee_id = ANY(%s)", (ids,))
        cur.execute("""UPDATE pay_period SET status = 'OPEN', released_by = NULL, released_at = NULL
                        WHERE status = 'RELEASED' AND NOT EXISTS (SELECT 1 FROM paystub ps WHERE ps.pay_period_id = pay_period.pay_period_id)""")
        cur.execute("DELETE FROM timesheet_entry WHERE employee_id = ANY(%s)", (ids,))
        cur.execute("""DELETE FROM project_assignment WHERE employee_id = ANY(%s)
                          OR project_id IN (SELECT project_id FROM project WHERE project_code = ANY(%s) AND special_type IS NULL)""",
                    (ids, manifest["project_codes"]))
        cur.execute("DELETE FROM direct_deposit WHERE employee_id = ANY(%s)", (ids,))
        cur.execute("DELETE FROM project WHERE project_code = ANY(%s) AND special_type IS NULL", (manifest["project_codes"],))
        cur.execute("DELETE FROM employee WHERE employee_id = ANY(%s) AND team_id IS NOT NULL", (ids,))
        cur.execute("DELETE FROM team WHERE name = ANY(%s)", (manifest["teams"],))
        cur.execute("DELETE FROM employee WHERE employee_id = ANY(%s)", (ids,))
        cur.execute("""DELETE FROM position_wage WHERE position_id IN (SELECT position_id FROM position WHERE title = ANY(%s)
                          AND NOT EXISTS (SELECT 1 FROM employee e WHERE e.position_id = position.position_id))""", (manifest["positions"],))
        cur.execute("""DELETE FROM position WHERE title = ANY(%s)
                          AND NOT EXISTS (SELECT 1 FROM employee e WHERE e.position_id = position.position_id)""", (manifest["positions"],))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cur.close()
    _delete_users(os.environ["USER_POOL_ID"], manifest["emails"])
    return {"ok": True, "message": "Demo data removed.", **preview}


def lambda_handler(event, context=None):
    action = (event or {}).get("action")
    one_of(action, "action", ["schema", "migrate", "seed", "demo", "reset"])
    if action == "schema":
        return load_schema()
    if action == "migrate":
        return migrate_schema()
    if action == "seed":
        return seed_admin(event)
    if action == "reset":
        return reset_demo(event)
    return load_demo(event)
