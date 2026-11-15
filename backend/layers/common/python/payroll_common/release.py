from collections import defaultdict

from . import payroll as pr
from .audit import audit
from .db import one, query
from .http_utils import HttpError


def release_period(conn, period_id, ctx, write_audit=True):
    period = one(conn, "SELECT * FROM pay_period WHERE pay_period_id = %s FOR UPDATE", (period_id,))
    if not period:
        raise HttpError(404, "Pay period not found")
    if period["status"] == "RELEASED":
        raise HttpError(409, "This pay period has already been released")
    if pr.today_bc() <= period["end_date"]:
        raise HttpError(409, "This pay period has not ended yet")
    n = one(conn, """SELECT COUNT(*)::int AS n FROM timesheet_entry WHERE NOT is_deleted AND work_date BETWEEN %s AND %s AND NOT approved""",
            (period["start_date"], period["end_date"]))["n"]
    if n:
        raise HttpError(409, f"{n} timesheet entr{'y is' if n == 1 else 'ies are'} not approved yet", {"unapprovedCount": n})
    year = period["pay_date"].year
    rates = pr.rates_for(year)
    emps = query(conn, """SELECT e.employee_id, e.first_name || ' ' || e.last_name AS name, e.hire_date, e.position_id,
                                 p.title, dd.account_last4
                            FROM employee e JOIN position p ON p.position_id = e.position_id
                            LEFT JOIN direct_deposit dd ON dd.employee_id = e.employee_id
                           WHERE e.employee_id IN (SELECT employee_id FROM timesheet_entry WHERE NOT is_deleted
                                                    AND work_date BETWEEN %s AND %s)
                           ORDER BY e.employee_id""", (period["start_date"], period["end_date"]))
    if not emps:
        raise HttpError(409, "No timesheet entries in this pay period; nothing to release")
    wages = pr.load_wages(conn, {e["position_id"] for e in emps})
    for e in emps:
        if not wages[e["position_id"]]:
            raise HttpError(409, f"The position \"{e['title']}\" has no wage set; add one before releasing")
    stat_dates = pr.stat_dates_between(conn, period["start_date"], period["end_date"])
    days = query(conn, """SELECT t.employee_id, t.work_date, p.project_id, p.project_code, p.special_type,
                                 (SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time))) / 60)::int AS minutes
                            FROM timesheet_entry t JOIN project p ON p.project_id = t.project_id
                           WHERE NOT t.is_deleted AND t.work_date BETWEEN %s AND %s
                           GROUP BY t.employee_id, t.work_date, p.project_id, p.project_code, p.special_type""",
                 (period["start_date"], period["end_date"]))
    by_emp = defaultdict(list)
    for d in days:
        by_emp[d["employee_id"]].append(d)
    ytd_rows = query(conn, """SELECT ps.employee_id,
                                     SUM(regular_hours + overtime_hours + double_overtime_hours + weekend_hours + stat_hours + sick_hours) AS hours,
                                     SUM(gross_pay) AS gross, SUM(cpp) AS cpp, SUM(ei) AS ei, SUM(federal_tax) AS federal,
                                     SUM(provincial_tax) AS provincial, SUM(net_pay) AS net
                                FROM paystub ps JOIN pay_period pp ON pp.pay_period_id = ps.pay_period_id
                               WHERE pp.start_date < %s AND EXTRACT(YEAR FROM pp.pay_date) = %s GROUP BY ps.employee_id""",
                     (period["start_date"], year))
    ytd_by = {r["employee_id"]: r for r in ytd_rows}
    out = []
    for e in emps:
        y = ytd_by.get(e["employee_id"], {})
        ytd = {k: (y.get(k) or 0) for k in ("hours", "gross", "cpp", "ei", "federal", "provincial", "net")}
        entries = [{"date": d["work_date"], "project_id": d["project_id"], "project_code": d["project_code"], "minutes": d["minutes"],
                    "kind": d["special_type"] if d["special_type"] in ("SICK", "VAC") else "WORK",
                    "rate": pr.wage_for(wages[e["position_id"]], d["work_date"])} for d in by_emp[e["employee_id"]]]
        calc = pr.calculate_paystub(entries, period["start_date"], pr.vacation_rate_for(e["hire_date"], period["end_date"]), ytd, rates,
                                    stat_dates)
        lines = calc.pop("earnings")
        row = {"employee_id": e["employee_id"], "pay_period_id": period_id, "employee_name": e["name"], "position_title": e["title"],
               "deposit_account_last4": e["account_last4"], **calc}
        cols = list(row)
        stub = one(conn, f"INSERT INTO paystub ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING paystub_id",
                   [row[c] for c in cols])
        for ln in lines:
            query(conn, """INSERT INTO paystub_earning (paystub_id, line_type, project_id, project_code, hours, rate, amount)
                           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                  (stub["paystub_id"], ln["line_type"], ln["project_id"], ln["project_code"], ln["hours"], ln["rate"], ln["amount"]))
        if write_audit:
            audit(conn, ctx, "paystub", stub["paystub_id"], "INSERT", None, row)
        out.append({"paystubId": stub["paystub_id"], "employeeId": e["employee_id"], "gross": calc["gross_pay"], "net": calc["net_pay"]})
    query(conn, "UPDATE pay_period SET status = 'RELEASED', released_by = %s, released_at = now() WHERE pay_period_id = %s",
          (ctx["employee_id"], period_id))
    if write_audit:
        audit(conn, ctx, "pay_period", period_id, "UPDATE", {"status": "OPEN"}, {"status": "RELEASED", "released_by": ctx["employee_id"]})
    return {"payPeriodId": period_id, "status": "RELEASED", "paystubsCreated": len(out), "paystubs": out}
