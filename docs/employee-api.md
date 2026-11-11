# Employee API (proposed)

Contract the employee portal (`frontend/src/pages/employee`) is built against. TypeScript shapes live in
[`frontend/src/lib/employee/types.ts`](../frontend/src/lib/employee/types.ts); the client is
[`api.ts`](../frontend/src/lib/employee/api.ts). Until `VITE_API_BASE_URL` is set, the frontend uses an
in-browser mock ([`mock.ts`](../frontend/src/lib/employee/mock.ts)) that behaves like this API.

Conventions

- `{id}` is the employee ID. Once Cognito is in, the backend should check it matches the caller's token
  (or drop it from the path and read it from the token).
- Dates are `YYYY-MM-DD`, times are `HH:mm` (24h), money is a number in CAD.
- Errors: non-2xx with a plain-text or `{ "message": "..." }` body.
- Lists are wrapped in an object (`{ "entries": [...] }`) so fields can be added later without breaking clients.

## Endpoints

| Method | Path | Replaces (original draft) |
|---|---|---|
| GET | `/employee/{id}/projects?search=` | same |
| GET | `/employee/{id}/pay-period?date=` | *new*: which period is open for edits |
| GET | `/employee/{id}/timesheets?from=&to=` | *new*: needed to load a week |
| POST | `/employee/{id}/timesheets` | `POST /employee/timesheets/{id}/input-timesheet` |
| DELETE | `/employee/{id}/timesheets/{timesheetId}` | `DELETE /employee/timesheets/{id}` |
| PATCH | `/employee/{id}/timesheets/submit` | `PATCH /employee/timesheets/{id}/submit-timesheet` |
| GET | `/employee/{id}/aggregate-pay?year=&granularity=` | `GET /employee/{id}/aggregate-pay` |
| GET | `/employee/{id}/pay-stubs?from=&to=` | *new*: the list for the date filter |
| GET | `/employee/{id}/pay-stubs/{payDate}` | `GET /employee/{id}/pay-stub/{month}/{date}` |
| GET | `/employee/{id}/profile` | `GET /employee/{id}/full-profile` |
| PATCH | `/employee/{id}/profile` | `PATCH /employee/update-profile` |

### Pay period (the edit lock)

Employees can only change time in the **current pay period**. The backend owns this rule, and the UI just follows it.
Periods are **bi-weekly**: 14 days, and they don't line up with calendar months, so the frontend can't work them out itself.
It always asks the backend which period a date falls in and whether that period is still open.

`GET /employee/{id}/pay-period`: the current period. `?date=2026-10-30` returns the period containing that date (the UI uses this for prev/next).
```json
{ "start": "2026-11-09", "end": "2026-11-22", "payDate": "2026-11-27", "isCurrent": true, "editable": true }
```
- `editable` is the lock. The UI hides Log time, Save and Submit when it's false.
- The backend must enforce it too: `POST`, `DELETE` and `submit` for dates outside an editable period return `409`.
- The UI never asks for a period after the current one.
- Keeping `editable` separate from `isCurrent` lets payroll later add a grace window (e.g. allow edits to the previous period until its pay date) without changing the frontend.

### Timesheets

Table row: `timesheetId` (PK), `employeeId`, `date`, `startTime`, `endTime`, `projectCode`, `submitted`, `approved`.
Hours are derived from start/end. The UI blocks overlapping entries on the same day, and the backend should too.

`GET /employee/{id}/timesheets?from=2026-11-09&to=2026-11-22`
```json
{ "entries": [
  { "timesheetId": "7f3c…", "employeeId": "E1001", "date": "2026-11-09", "startTime": "09:00", "endTime": "17:00",
    "projectCode": "PRJ-100", "submitted": false, "approved": false }
] }
```

`POST /employee/{id}/timesheets`: batch create (the **Save** button sends every new entry in one call)
```json
{ "entries": [ { "date": "2026-11-10", "startTime": "09:00", "endTime": "12:30", "projectCode": "PRJ-200" } ] }
```
→ `201 { "entries": [ …created rows with timesheetId, submitted=false, approved=false ] }`

`DELETE /employee/{id}/timesheets/{timesheetId}` → `204`. `409` if the row is already submitted or its period isn't editable.
The primary key identifies the row, so there's no need to send the whole entry back.
There's no update endpoint: the UI edits an entry by deleting it and creating a new one on save.
Add `PUT /employee/{id}/timesheets/{timesheetId}` later if you want real edits.

`PATCH /employee/{id}/timesheets/submit`: the **Submit pay period** button. Sets `submitted = true` on every row in the range.
```json
{ "from": "2026-11-09", "to": "2026-11-22" }
```
→ `200 { "entries": [ …rows in range ] }`

### Projects

`GET /employee/{id}/projects?search=pay` → `{ "projects": [ { "projectCode": "PRJ-100", "name": "Payroll Platform" } ] }`

### Aggregate pay

`GET /employee/{id}/aggregate-pay?year=2026&granularity=quarterly` (`ytd` | `quarterly` | `monthly`)
```json
{
  "employeeId": "E1001", "year": 2026, "granularity": "quarterly",
  "periods": [
    { "label": "Q1", "start": "2026-01-01", "end": "2026-03-31", "hours": 488, "gross": 20740.00,
      "deductions": { "federalTax": 2488.80, "provincialTax": 933.30, "cpp": 1234.03, "ei": 340.14 },
      "net": 15743.73 }
  ]
}
```
`ytd` returns one period for the year so far. `monthly` returns up to 12 (`label` = `Jan`…`Dec`). Periods with no pay are omitted.
"Yearly" is just `ytd` for a past year.

### Pay stubs

Pay dates follow the backend's bi-weekly schedule; each stub covers one 14-day pay period.
The frontend fills its From/To dropdowns from this list, so it never assumes which dates are pay dates.

`GET /employee/{id}/pay-stubs?from=2026-05-29&to=2026-11-13` → newest first
```json
{ "payStubs": [ { "payDate": "2026-11-13", "periodStart": "2026-10-26", "periodEnd": "2026-11-08",
                  "hours": 88, "gross": 3740.00, "net": 2839.03 } ] }
```

`GET /employee/{id}/pay-stubs/2026-11-13`
```json
{
  "employeeId": "E1001", "employeeName": "Alex Morgan", "position": "Software Developer",
  "payDate": "2026-11-13", "periodStart": "2026-10-26", "periodEnd": "2026-11-08",
  "hours": 88, "gross": 3740.00, "net": 2839.03,
  "earnings": [ { "projectCode": "PRJ-100", "hours": 44, "rate": 42.5, "amount": 1870.00 } ],
  "deductions": { "federalTax": 448.80, "provincialTax": 168.30, "cpp": 222.53, "ei": 61.34 },
  "ytd": { "hours": 1748, "gross": 74290.00, "deductions": { "federalTax": 8914.80, "provincialTax": 3343.05, "cpp": 4420.29, "ei": 1218.38 }, "net": 56393.48 },
  "depositAccount": "***4567"
}
```
The PDF is generated in the browser from this JSON, so the backend doesn't need a PDF endpoint.

### Profile

`GET /employee/{id}/profile`
```json
{
  "employeeId": "E1001", "firstName": "Alex", "lastName": "Morgan", "email": "alex.morgan@example.com",
  "position": "Software Developer", "payGrade": "P2", "hourlyRate": 42.5, "phone": "+16045550142",
  "address": { "street": "3700 Willingdon Ave", "city": "Burnaby", "province": "BC", "postalCode": "V5G 3H2", "country": "Canada" },
  "directDeposit": { "institutionNumber": "004", "transitNumber": "12345", "accountNumber": "***4567" }
}
```
Never return the full account number; mask it.

`PATCH /employee/{id}/profile`: send only the sections that changed. Leave out `directDeposit.accountNumber` to keep the current account.
`phone` is always sent and returned in E.164 form, `+1` followed by the 10 digits: `+16045550142`.
The UI validates it (Canadian/US numbers only) and only formats it as `(604) 555-0142` for display. The backend should store it as-is and reject anything that isn't `^\+1[2-9]\d{2}[2-9]\d{6}$` with `400`. This is also the format Cognito's `phone_number` attribute expects.
```json
{ "phone": "+16045550199" }
{ "address": { "street": "…", "city": "…", "province": "BC", "postalCode": "V5G 3H2", "country": "Canada" } }
{ "directDeposit": { "institutionNumber": "004", "transitNumber": "12345", "accountNumber": "9876543" } }
```
→ `200` with the updated profile (same shape as GET).

## Quick reference

| Method & path | Requires | Returns | Summary |
|---|---|---|---|
| `GET /employee/{id}/projects` | query `search?` | `{ projects: [{ projectCode, name }] }` | Projects for the timesheet dropdown |
| `GET /employee/{id}/pay-period` | query `date?` (YYYY-MM-DD) | `{ start, end, payDate, isCurrent, editable }` | Pay period containing the date (default today); `editable` is the edit lock |
| `GET /employee/{id}/timesheets` | query `from`, `to` | `{ entries: TimesheetEntry[] }` | Entries in a date range |
| `POST /employee/{id}/timesheets` | body `{ entries: [{ date, startTime, endTime, projectCode }] }` | `201 { entries: TimesheetEntry[] }` | Batch create (Save button); `409` if outside the open period |
| `DELETE /employee/{id}/timesheets/{timesheetId}` | none | `204` | Delete an unsubmitted entry in the open period; `409` otherwise |
| `PATCH /employee/{id}/timesheets/submit` | body `{ from, to }` | `{ entries: TimesheetEntry[] }` | Sets `submitted = true` for the pay period |
| `GET /employee/{id}/aggregate-pay` | query `year`, `granularity` = `ytd` \| `quarterly` \| `monthly` | `{ employeeId, year, granularity, periods: [{ label, start, end, hours, gross, deductions, net }] }` | Pay totals for the dashboard and pie chart |
| `GET /employee/{id}/pay-stubs` | query `from`, `to` (pay dates) | `{ payStubs: [{ payDate, periodStart, periodEnd, hours, gross, net }] }` | Pay stub list, newest first |
| `GET /employee/{id}/pay-stubs/{payDate}` | path `payDate` (a pay date from the list) | `PayStub` (summary + `employeeName`, `position`, `earnings[]`, `deductions`, `ytd`, `depositAccount`) | One stub; the PDF is built from this JSON |
| `GET /employee/{id}/profile` | none | `EmployeeProfile` (account number masked) | Name, position, phone, address, direct deposit |
| `PATCH /employee/{id}/profile` | body any of `{ phone?, address?, directDeposit? }` | `EmployeeProfile` | Update contact or banking info; omit `accountNumber` to keep it |

Shared shapes:

```ts
TimesheetEntry = { timesheetId, employeeId, date, startTime, endTime, projectCode, submitted: boolean, approved: boolean }
Deductions     = { federalTax, provincialTax, cpp, ei }
Address        = { street, city, province, postalCode, country }
DirectDeposit  = { institutionNumber, transitNumber, accountNumber }
EmployeeProfile = { employeeId, firstName, lastName, email, position, payGrade, hourlyRate, phone, address: Address, directDeposit: DirectDeposit }
PayStub        = { payDate, periodStart, periodEnd, hours, gross, net, employeeId, employeeName, position,
                   earnings: [{ projectCode, hours, rate, amount }], deductions: Deductions,
                   ytd: { hours, gross, deductions: Deductions, net }, depositAccount }
```
