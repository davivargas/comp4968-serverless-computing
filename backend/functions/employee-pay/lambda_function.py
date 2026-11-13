"""Employee-facing pay information (read-only): aggregate pay and pay stubs (looked up by pay date)."""
import calendar
import datetime

from payroll_common.payroll import today_bc

def _bounds(granularity, key, year):
    """Return the label, start date, and end date for the given granularity and key."""
    if granularity == "monthly":
        last_day_of_month = calendar.monthrange(key.year, key.month)[1]
        return key.strftime("%Y-%m"), key, datetime.date(key.year, key.month, last_day_of_month)
    if granularity == "quarterly":
        end_month = key.month + 2
        return f"{key.year}-Q{(key.month - 1) // 3 + 1}", key, datetime.date(key.year, end_month, calendar.monthrange(key.year, end_month)[1])
    return "YTD", datetime.date(year, 1, 1), min(today_bc(), datetime.date(year, 12, 31))
