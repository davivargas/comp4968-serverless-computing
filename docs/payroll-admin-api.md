# Payroll Admin API

Contract used by the Payroll Admin portal (`frontend/src/pages/payroll_admin`). TypeScript shapes live in
[`frontend/src/lib/payroll_admin/types.ts`](../frontend/src/lib/payroll_admin/types.ts), and the HTTP client
and in-browser mock are in [`api.ts`](../frontend/src/lib/payroll_admin/api.ts) and
[`mock.ts`](../frontend/src/lib/payroll_admin/mock.ts). `VITE_API_BASE_URL` selects HTTP instead of the mock.

## Conventions

- Payroll-admin routes under `/pa` require an authenticated Payroll Admin role. `GET /stat-holidays` is available to any role.
- Dates use `YYYY-MM-DD`; money is a number in CAD.
- Errors use the backend response body and non-2xx status. Relevant validation failures include `400`, `404`, and `409` as noted below.
- List responses are wrapped and may include pagination or aggregation metadata.

## Employee records and pay totals

`GET /pa/employees` returns records with pay totals aggregated from released pay stubs for the requested period. All query parameters are optional.

| Query parameter | Meaning |
|---|---|
| `status` | `ACTIVE` or `DEACTIVATED` |
| `search` | Employee name search |
| `positionId`, `teamId`, `projectId` | Filter by the corresponding ID |
| `payDate` | One pay date (`YYYY-MM-DD`) |
| `fromPayDate`, `toPayDate` | Inclusive pay-date range (`YYYY-MM-DD`); use together |
| `year` | Aggregation year; defaults to the current year |
| `sort` | `id`, `name`, `position`, `team`, `gross`, or `hours` |
| `order` | `asc` or `desc` |
| `limit`, `offset` | Page size from 1–200 (default 50) and offset |

`payDate` is mutually exclusive with a range; a date range is mutually exclusive with `year`.

```json
{
  "total": 48,
  "aggregationPeriod": "2026",
  "limit": 50,
  "offset": 0,
  "employees": [{
    "employeeId": "E1001", "firstName": "Alex", "lastName": "Morgan", "status": "ACTIVE",
    "positionId": "POS-001", "position": "Software Developer", "teamId": "TEAM-01", "team": "Engineering",
    "hours": 88, "gross": 3740, "deductions": 900, "net": 2840
  }]
}
```

`GET /pa/employees/{id}` returns one employee with aggregate totals and released pay stubs. `{id}` is the employee ID; `404` if not found. It accepts the same optional period selectors (`payDate`, `fromPayDate` + `toPayDate`, or `year`).

```json
{
  "employee": {
    "employeeId": "E1001", "firstName": "Alex", "lastName": "Morgan", "email": "alex@example.com",
    "phone": "+16045550142", "address": "…", "status": "ACTIVE", "hireDate": "2023-01-15",
    "position": "Software Developer", "payGrade": "P2", "hourlyRate": 42.5,
    "teamId": "TEAM-01", "team": "Engineering", "managerId": "E1002", "managerName": "Alice Johnson",
    "depositAccountLast4": "4567"
  },
  "aggregationPeriod": "2026",
  "aggregate": { "hours": 88, "gross": 3740, "deductions": 900, "net": 2840 },
  "payStubs": [{ "payDate": "2026-11-20", "periodStart": "2026-11-02", "periodEnd": "2026-11-15", "hours": 88, "gross": 3740, "deductions": 900, "net": 2840 }]
}
```

## Positions and wages

| Method and path | Requires | Returns | Summary |
|---|---|---|---|
| `GET /pa/positions` | None | `{ positions: [{ positionId, title, payGrade, hourlyRate, effectiveFrom, nextWage }] }` | Lists non-deleted positions. `hourlyRate` is today's wage; `nextWage` is the next scheduled wage or `null`. |
| `POST /pa/positions` | `{ title, payGrade, hourlyRate, effectiveFrom: "YYYY-MM-DD" }` | `201` with the created position and `nextWage: null` | Creates a position and its first wage. `409` if a non-deleted position already uses the title. |
| `PATCH /pa/positions/{id}` | Any of `{ title }`, `{ payGrade }`, `{ hourlyRate, effectiveFrom }`, or `{ isDeleted: true }` | Updated position; `204` for deletion | Updates position fields, appends a wage row, or soft deletes. Wage changes require both fields. A date on or before the latest released period end returns `400`; deletion returns `409` if employees hold the position and `404` if already deleted. |

## Pay periods and release

`GET /pa/pay-periods?limit=&offset=` lists bi-weekly periods newest first.

```json
{ "payPeriods": [{ "payPeriodId": "PP-2026-22", "start": "2026-11-02", "end": "2026-11-15", "payDate": "2026-11-20", "status": "OPEN", "unapprovedCount": 0, "employeeCount": 48, "canRelease": true, "releasedAt": null }] }
```

`canRelease` is true only after the period ends, while it remains open and every entry is approved.

`PATCH /pa/payroll/{id}/release` releases the period identified by `payPeriodId`, creates one stub per employee with entries, and locks the period. It applies the same checks as `canRelease`. `409` if the period has not ended, was already released, has unapproved entries (details include `unapprovedCount`), has no entries, or a position has no wage.

Weekend, stat holiday, sick leave, and vacation leave hours are saved on each stub. Bank details are not required; an employee without bank details is paid by cheque.

```json
{ "payPeriodId": "PP-2026-22", "status": "RELEASED", "paystubsCreated": 1, "paystubs": [{ "paystubId": "STUB-1", "employeeId": "E1001", "gross": 3740, "net": 2840 }] }
```

## Stat holidays

| Method and path | Requires | Returns | Summary |
|---|---|---|---|
| `GET /stat-holidays?year=` | Optional year (`YYYY`), defaults to current year | `{ holidays: [{ date, name }] }` | Lists dates for timesheet display; any role may call it. |
| `POST /pa/stat-holidays` | Body `{ date: "YYYY-MM-DD", name }` | `201 { date, name }` | Adds a holiday. `400` for an invalid date or empty name; `409` if that date already exists or falls inside a released period. |
| `DELETE /pa/stat-holidays/{date}` | Path date in `YYYY-MM-DD` format | `204` (no body) | Removes a holiday. `404` if missing; `409` if it falls inside a released period. |

## Quick reference

| Method and path | Requires | Returns | Summary |
|---|---|---|---|
| `GET /pa/employees` | Optional filters, sort/order, limit/offset | `{ total, aggregationPeriod, limit, offset, employees: [...] }` | Employee list and pay totals for the selected period |
| `GET /pa/employees/{id}` | Employee ID; optional period selector | `{ employee, aggregationPeriod, aggregate, payStubs }` | Employee detail and released pay history |
| `GET /pa/positions` | None | `{ positions: [...] }` | Position list and current/next wages |
| `POST /pa/positions` | Position fields and first wage | `201 Position` | Create a position |
| `PATCH /pa/positions/{id}` | Position update, wage change, or soft-delete body | `Position` or `204` | Update a position or wage history |
| `GET /pa/pay-periods` | Optional `limit`, `offset` | `{ payPeriods: [...] }` | Period list and release eligibility |
| `PATCH /pa/payroll/{id}/release` | Pay period ID | Release result with created pay stubs | Release and lock a period |
| `GET /stat-holidays` | Optional `year` | `{ holidays: [...] }` | List holidays; any role |
| `POST /pa/stat-holidays` | Date and name | `201 { date, name }` | Add a holiday |
| `DELETE /pa/stat-holidays/{date}` | Date path | `204` | Remove a holiday |
