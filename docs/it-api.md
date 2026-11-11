# IT Admin API (proposed)

Contract the IT portal (`frontend/src/pages/it`) is built against. TypeScript shapes live in
[`frontend/src/lib/it/types.ts`](../frontend/src/lib/it/types.ts); the client is
[`api.ts`](../frontend/src/lib/it/api.ts). Until `VITE_API_BASE_URL` is set, the frontend uses an
in-browser mock ([`mock.ts`](../frontend/src/lib/it/mock.ts)) that behaves like this API.

Conventions are the same as the [employee API](./employee-api.md). Every endpoint must check that the caller
is in the IT Admin group. Passwords are never returned by any endpoint.

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/it/employees` | | `{ "employees": Employee[] }`: id, name, email, title, role, active, managerId, managerName |
| POST | `/it/employees` | `CreateAccountInput` | Creates the account; returns the new `Employee` |
| PATCH | `/it/employees/{id}/role` | `{ role, adminPassword? }` | `adminPassword` (the caller's own) is required when granting or removing `IT_ADMIN`; the backend must verify it |
| PATCH | `/it/employees/{id}/title` | `{ title }` | Job title/level, display only |
| PATCH | `/it/employees/{id}/status` | `{ active }` | Deactivating should also revoke the user's sessions |
| PATCH | `/it/employees/{id}/credentials` | `{ email?, password? }` | Change either or both |

`role` is the access role: `EMPLOYEE`, `MANAGER`, `PAYROLL_ADMIN` or `IT_ADMIN`. `title` is the job title
(for example "Software Engineer 2"), shown for display and independent of access.
