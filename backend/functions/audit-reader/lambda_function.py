import base64
import datetime
import json
import os
from zoneinfo import ZoneInfo

import boto3
from boto3.dynamodb.conditions import Attr, Key

from payroll_common.auth import with_auth
from payroll_common.http_utils import qs, router
from payroll_common.payroll import today_bc
from payroll_common.validate import bad, one_of, opt_date, opt_int, require_int, require_str

_table = None
VAN, UTC = ZoneInfo("America/Vancouver"), datetime.timezone.utc


def table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(os.environ["AUDIT_TABLE"])
    return _table


def _month_list(lo, hi):
    out, y, m = [], hi.year, hi.month
    while (y, m) >= (lo.year, lo.month):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out


def logs(event, ctx):
    q = qs(event)
    to = opt_date(q.get("to"), "to") or today_bc()
    frm = opt_date(q.get("from"), "from") or (to - datetime.timedelta(days=90))
    if frm > to:
        bad("from must not be after to")
    if (to - frm).days > 366:
        bad("The date range can be at most 366 days")
    lo = datetime.datetime.combine(frm, datetime.time.min, tzinfo=VAN).astimezone(UTC)
    hi = datetime.datetime.combine(to + datetime.timedelta(days=1), datetime.time.min, tzinfo=VAN).astimezone(UTC)
    lo_s, hi_s = lo.isoformat(timespec="microseconds"), hi.isoformat(timespec="microseconds")
    limit = require_int(q.get("limit", 50), "limit")
    if not 1 <= limit <= 200:
        bad("limit must be between 1 and 200")
    flt = None
    for key, attr, val in (("table", "table", q.get("table")), ("recordId", "recordId", q.get("recordId")),
                           ("changedBy", "changedBy", opt_int(q.get("changedBy"), "changedBy")),
                           ("action", "action", one_of(q["action"], "action", ["INSERT", "UPDATE", "DELETE"]) if q.get("action") else None)):
        if val is not None and val != "":
            c = Attr(attr).eq(str(val) if key in ("table", "recordId") else val)
            flt = c if flt is None else flt & c
    months = _month_list(lo, hi - datetime.timedelta(microseconds=1))
    start_key = None
    if q.get("nextToken"):
        try:
            tok = json.loads(base64.urlsafe_b64decode(q["nextToken"]))
            months = [m for m in months if m <= tok["m"]]
            start_key = tok.get("lek")
            if not months or months[0] != tok["m"]:
                raise ValueError
        except Exception:
            bad("nextToken is not valid for this query")
    items, next_token, calls, done = [], None, 0, False
    for mi, month in enumerate(months):
        lek = start_key if mi == 0 else None
        while True:
            args = {"KeyConditionExpression": Key("month").eq(month) & Key("sk").between(lo_s, hi_s),
                    "ScanIndexForward": False, "Limit": limit - len(items)}
            if flt is not None:
                args["FilterExpression"] = flt
            if lek:
                args["ExclusiveStartKey"] = lek
            res = table().query(**args)
            calls += 1
            items += res.get("Items", [])
            lek = res.get("LastEvaluatedKey")
            if len(items) >= limit or calls >= 60:
                if lek:
                    next_token = {"m": month, "lek": lek}
                elif mi + 1 < len(months):
                    next_token = {"m": months[mi + 1], "lek": None}
                done = True
                break
            if not lek:
                break
        if done:
            break
