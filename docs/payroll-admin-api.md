# Payroll Admin API contract

All `/pa/*` requests use the Payroll Admin active role. The general stat-holiday list is available to any role.

| API link | Summary | Requires | Returns |
|---|---|---|---|
| `GET /pa/employees` | Employee records and pay totals for a chosen period | Optional filters and pagination | `{ total, aggregationPeriod, limit, offset, employees: [...] }` |
| `GET /pa/employees/{id}` | Employee details, aggregate pay, and released pay stubs | Optional `payDate`, `fromPayDate` + `toPayDate`, or `year` | `{ employee, aggregationPeriod, aggregate, payStubs }` |
| `PATCH /pa/payroll/{id}/release` | Release a period, creating one stub per employee with entries and locking the period | `id` is a `payPeriodId` | `{ payPeriodId, status: "RELEASED", paystubsCreated, paystubs }` |
| `POST /pa/stat-holidays` | Add a stat holiday date; `409` when duplicate or within a released period, `400` for invalid date or empty name | `{ date: "YYYY-MM-DD", name }` | `201 { date, name }` |
| `DELETE /pa/stat-holidays/{date}` | Remove a stat holiday; `404` when missing, `409` within a released period | Path date in `YYYY-MM-DD` format | `204` |
| `GET /stat-holidays` | List stat holiday dates for timesheet display; available to any role | Optional `year` (`YYYY`), defaults to current year | `{ holidays: [{ date, name }] }` |

Payroll release creates one pay stub per employee who has entries. It applies the same readiness checks as `canRelease` and returns `409` if the period has not ended, was already released, contains unapproved entries (with `unapprovedCount` details), has no entries, or a position has no wage. Weekend, statutory holiday, sick leave, and vacation leave hours are stored on each stub. Bank details are not required; employees without them are paid by cheque.
