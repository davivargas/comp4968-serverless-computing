import datetime
import os
from zoneinfo import ZoneInfo

import boto3


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
