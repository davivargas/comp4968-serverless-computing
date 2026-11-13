# Manager API (proposed)

Contract for `frontend/src/pages/manager`. Types live in
[`types.ts`](../frontend/src/lib/manager/types.ts), the client in
[`api.ts`](../frontend/src/lib/manager/api.ts), and the persistent browser mock in
[`mock.ts`](../frontend/src/lib/manager/mock.ts).
Without `VITE_API_BASE_URL`, the portal uses the mock. Set that variable to the API origin to use HTTP.

Source: the supplied **API link.xlsx**, Manager rows 24–30 and 36–41. Rows 36–41 supersede
the earlier per-entry approval/rejection and `/manager/create-project` draft routes.
The workbook is reference material; its endpoint descriptions are requirements for the contract,
not instructions to execute requests against a live service.

## Conventions

- Every endpoint must authorize the signed-in manager and scope access to their managed teams or owned projects.
- The client sends `X-Active-Role: MANAGER`. Cognito bearer-token attachment and `/me` session loading remain TODOs,
  as in the existing portals. `CURRENT_MANAGER` is Alice Johnson (`E1002`) for the demo.
- Dates are `YYYY-MM-DD`; times are 24-hour `HH:mm`. Hours are derived from start/end times.
- Project IDs and employee IDs are strings. Project codes are integers in the workbook's newer project contract.
  Timesheet `projectCode` remains a string, matching the employee timesheet type. The existing employee mock
  uses codes such as `PRJ-100`; agree on normalization before connecting the portals to a shared backend.
- Errors are non-2xx with plain text or `{ "message": "..." }`, matching the existing clients' convention.
  The current client displays the response text on failure.
- List responses are wrapped in objects.

## Endpoints

| Method | Path | Input | Returns |
|---|---|---|---|
| GET | `/manager/timesheets` | Optional query `status`, `employeeId`, `from`, `to`, `sort`, `order`, `limit`, `offset` | `{ timesheets: ManagerTimesheet[], limit, offset }` |
| GET | `/manager/timesheets/{id}` | `id` = timesheet ID | `ManagerTimesheet` |
| PATCH | `/manager/employees/{id}/timesheets/approve` | `id` = employee ID; body `{ from, to }` | `{ entries: TimesheetEntry[] }` |
| PATCH | `/manager/employees/{id}/timesheets/reject` | `id` = employee ID; body `{ from, to }` | `{ entries: TimesheetEntry[] }` |
| GET | `/manager/{id}/employees` | Own manager employee ID; optional `projectId`, `sort=name\|id`, `order=asc\|desc` | `{ employees: ManagedEmployee[] }` |
| GET | `/manager/projects` | None | `{ projects: ManagerProject[] }` |
| GET | `/manager/projects/{id}/employees` | Project ID | `{ projectId, projectCode, employees: [{ employeeId, firstName, lastName, status }] }` |
| POST | `/manager/projects` | `{ name, projectCode?: number }` | `201 ManagerProject` |
| PATCH | `/manager/projects/{id}` | Any of `{ name, status, isDeleted: true }` | `ManagerProject`, or `204` for deletion |
| POST | `/manager/{id}/assign-employee` | Project ID; `{ employeeId }` | `201 { projectId, employeeId, alreadyAssigned: false }`, or `200` with `alreadyAssigned: true` |

The employee-list client currently exposes only the optional `projectId` filter; the UI displays the returned order.
The timesheet UI uses date descending order and pages of 50; the client also supports the workbook's sort fields.

### Timesheet retrieval

`status` is `pending` (submitted and not approved), `approved`, or `unsubmitted`.
Omit it for every status. `from`/`to` are inclusive. `sort` is `date` or `employee`,
`order` is `asc` or `desc` (default newest date first). `limit` is 1–200, default 50;
`offset` is nonnegative. The workbook supplies no total count; the UI allows a next page
when the current page is full and handles an empty final page.

```json
{
  "timesheets": [{
    "timesheetId": "M-0-0", "employeeId": "E1001", "employeeName": "Alex Morgan",
    "date": "2026-11-09", "startTime": "09:00", "endTime": "17:00",
    "projectCode": "100", "projectName": "Payroll Platform", "submitted": true, "approved": false
  }],
  "limit": 50, "offset": 0
}
```

Single-entry lookup returns `404` for a missing entry or one outside the manager's team scope.

### Review a complete pay period

```http
PATCH /manager/employees/E1001/timesheets/approve
Content-Type: application/json
X-Active-Role: MANAGER

{ "from": "2026-11-09", "to": "2026-11-22" }
```

Approval sets `submitted=true`, `approved=true` on every entry in the range. Return `409`
when no entries are submitted or any entry is unsubmitted. Rejection uses `/reject`, sets both
flags to false, and returns `409` if no entry is submitted. Apply changes atomically to the complete period.
The UI confirms the employee and dates and explicitly includes entries hidden by the status filter.

The workbook's mutation responses use the base employee `TimesheetEntry` fields, without employee/project
display names. The UI ignores the mutation payload and reloads the list. The mock returns enriched rows.

The backend must validate that the dates describe one complete backend-owned pay period and authorize
the employee relationship. The demo uses the existing employee mock's 14-day schedule, anchored at
2025-01-06; its initial review dates are 2026-11-09 through 2026-11-22. Before live integration,
connect the manager period picker to an authorized backend schedule source rather than calculating it
in the UI. The workbook does not specify a dedicated manager pay-period endpoint.

### Projects and assignments

```json
{ "name": "Customer Portal", "projectCode": 401 }
```

Creates an ACTIVE project with zero assignments. Omit `projectCode` to generate the highest existing
code plus one. A code is never reused, including codes belonging to deleted projects (`409` on conflict).

`PATCH` can rename, close (`CLOSED`), reopen (`ACTIVE`), or soft delete (`isDeleted: true`) a project.
Only its creator can change it (`403` otherwise). Deletion returns `409` when employees are assigned or
timesheet history references the project; close it instead. Deleted projects are hidden and return `404`.

Assignments require an ACTIVE project (`409` otherwise), owned by the manager (`403` otherwise),
and an active employee on a managed team or the manager themself (`400` otherwise).
Missing/deleted projects return `404`. Repeating an assignment succeeds without duplicating it.
No unassignment endpoint is specified in the workbook or implemented in this portal.

## Shared shapes

```ts
ManagedEmployee = { employeeId, firstName, lastName, email, status, position, team }
ManagerProject = { projectId, projectCode: number, name, status: 'ACTIVE' | 'CLOSED', employeeCount }
ManagerTimesheet = { timesheetId, employeeId, employeeName, date, startTime, endTime,
                     projectCode, projectName, submitted: boolean, approved: boolean }
```

`status` for employees is modeled as `ACTIVE | INACTIVE`; confirm the exact backend enum before integration.

## Mock behavior and integration limits

Changes persist under `mock.manager.v1` in localStorage; remove that key and reload to reset.
When storage is unavailable, changes last for the current page load. The mock includes Alex, Carol,
and Eve to match the existing IT seed, with Alice as manager. Demo timesheets are dated November 9–11, 2026.
Employee, IT, and manager mocks are independent: approval here does not update the employee portal's
`mock.timesheets`, and IT account changes do not alter the manager's team. Shared backend data will replace these stores.
The mock cannot provide real authentication, authorization, payroll release locks, or concurrency control;
the backend must enforce those rules. Payroll lock behavior for manager review still needs agreement.

To preview: run `npm.cmd run dev` in `frontend`, open `/manager`, or choose Manager on the landing page
and continue through mock sign-in. Existing shared components provide responsive navigation and light/dark themes.
