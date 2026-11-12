"""Person 3 - GET /me, employee personal profile and direct deposit."""
import base64
import os

import boto3

from payroll_common.audit import audit
from payroll_common.auth import assert_self, with_auth
from payroll_common.db import get_conn, one, query, transaction
from payroll_common.http_utils import HttpError, parse_body, router
from payroll_common.payroll import mask, today_bc
from payroll_common.shapes import WAGE_JOIN
from payroll_common.validate import address, address_json, bad, digits, path_id, phone_e164

EMP = ["EMPLOYEE"]


def _kms_encrypt(plaintext):
    key = os.environ.get("DEPOSIT_KMS_KEY_ID")
    if not key:
        raise RuntimeError("DEPOSIT_KMS_KEY_ID is not set")
    blob = boto3.client("kms").encrypt(KeyId=key, Plaintext=plaintext.encode("utf-8"))["CiphertextBlob"]
    return base64.b64encode(blob).decode("ascii")


def get_me(event, ctx):
    """GET /me - used right after the Cognito sign-in to fill the role choice on the login page."""
    return {"employeeId": ctx["employee_id"], "firstName": ctx["first_name"], "lastName": ctx["last_name"],
            "availableRoles": ctx["available"]}


def _profile(conn, emp_id):
    today = today_bc()
    r = one(conn, f"""SELECT e.employee_id, e.first_name, e.last_name, e.email, e.phone, e.street, e.city, e.province, e.postal_code,
                             e.country, p.title AS position, p.pay_grade, cw.hourly_wage,
                             d.institution_no, d.transit_no, d.account_last4
                        FROM employee e JOIN position p ON p.position_id = e.position_id {WAGE_JOIN}
                        LEFT JOIN direct_deposit d ON d.employee_id = e.employee_id
                       WHERE e.employee_id = %s""", (today, today, emp_id))
    if not r:
        raise HttpError(404, "Employee not found")
    deposit = None
    if r["institution_no"]:
        deposit = {"institutionNumber": r["institution_no"], "transitNumber": r["transit_no"],
                   "accountNumber": mask(r["account_last4"])}   # the full account number is never returned
    return {"employeeId": r["employee_id"], "firstName": r["first_name"], "lastName": r["last_name"], "email": r["email"],
            "position": r["position"], "payGrade": r["pay_grade"], "hourlyRate": r["hourly_wage"], "phone": r["phone"],
            "address": address_json(r), "directDeposit": deposit}


def get_profile(event, ctx):
    """GET /employee/{id}/profile"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    return _profile(get_conn(), emp_id)


def update_profile(event, ctx):
    """PATCH /employee/{id}/profile  body: any of {phone, address:{...}, directDeposit:{institutionNumber, transitNumber, accountNumber}}"""
    emp_id = path_id(event)
    assert_self(ctx, emp_id)
    b = parse_body(event)
    changes = {}
    if "phone" in b:
        changes["phone"] = phone_e164(b["phone"])
    if "address" in b:
        changes.update(address(b["address"]))
    dd = b.get("directDeposit")
    new_dd = {}
    if dd is not None:
        if not isinstance(dd, dict) or not dd:
            bad("directDeposit must be an object with at least one field")
        if "institutionNumber" in dd:
            new_dd["institution_no"] = digits(dd["institutionNumber"], "directDeposit.institutionNumber", (3,))
        if "transitNumber" in dd:
            new_dd["transit_no"] = digits(dd["transitNumber"], "directDeposit.transitNumber", (5,))
        if "accountNumber" in dd:
            new_dd["account_no"] = digits(dd["accountNumber"], "directDeposit.accountNumber", range(7, 13))
    if not changes and not new_dd:
        bad("No updatable fields supplied")
    encrypted = _kms_encrypt(new_dd["account_no"]) if "account_no" in new_dd else None
    with transaction() as conn:
        old = one(conn, "SELECT phone, street, city, province, postal_code, country FROM employee WHERE employee_id = %s FOR UPDATE", (emp_id,))
        if changes:
            cols = list(changes)
            query(conn, f"UPDATE employee SET {', '.join(c + ' = %s' for c in cols)}, updated_at = now() WHERE employee_id = %s",
                  [changes[c] for c in cols] + [emp_id])
            audit(conn, ctx, "employee", emp_id, "UPDATE", {c: old[c] for c in cols}, changes)
        if new_dd:
            prev = one(conn, "SELECT institution_no, transit_no, account_last4 FROM direct_deposit WHERE employee_id = %s FOR UPDATE", (emp_id,))
            if prev is None:
                if set(new_dd) != {"institution_no", "transit_no", "account_no"}:
                    bad("directDeposit needs institutionNumber, transitNumber and accountNumber the first time")
                query(conn, """INSERT INTO direct_deposit (employee_id, institution_no, transit_no, account_no, account_last4)
                               VALUES (%s, %s, %s, %s, %s)""",
                      (emp_id, new_dd["institution_no"], new_dd["transit_no"], encrypted, new_dd["account_no"][-4:]))
            else:
                sets, vals = [], []
                for col in ("institution_no", "transit_no"):
                    if col in new_dd:
                        sets.append(f"{col} = %s")
                        vals.append(new_dd[col])
                if encrypted:
                    sets += ["account_no = %s", "account_last4 = %s"]
                    vals += [encrypted, new_dd["account_no"][-4:]]
                query(conn, f"UPDATE direct_deposit SET {', '.join(sets)}, updated_at = now() WHERE employee_id = %s", vals + [emp_id])
            # bank numbers are redacted by the audit helper; the last 4 digits are kept
            audit(conn, ctx, "direct_deposit", emp_id, "UPDATE" if prev else "INSERT", prev,
                  {**new_dd, **({"account_last4": new_dd["account_no"][-4:]} if "account_no" in new_dd else {})})
        return _profile(conn, emp_id)


lambda_handler = router({
    "GET /me": with_auth(None, get_me),
    "GET /employee/{id}/profile": with_auth(EMP, get_profile),
    "PATCH /employee/{id}/profile": with_auth(EMP, update_profile),
})
