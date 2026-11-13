# IT Admin API

Contract the IT portal (`frontend/src/pages/it`) is built against. TypeScript shapes live in
[`frontend/src/lib/it/types.ts`](../frontend/src/lib/it/types.ts); the client is
[`api.ts`](../frontend/src/lib/it/api.ts). Until `VITE_API_BASE_URL` is set, the frontend uses an
in-browser mock ([`mock.ts`](../frontend/src/lib/it/mock.ts)) that enforces the same rules and errors.

Conventions are the same as the [employee API](./employee-api.md). Every call sends `X-Active-Role: IT`.
Passwords are never returned. Errors are non-2xx with a message the UI shows as-is.

Roles: `EMPLOYEE`, `MANAGER`, `PAYROLL_ADMIN`, `IT`. Everyone is an employee and has at most one extra role.
Account status: `ACTIVE`, `DEACTIVATED`.

A **user** is `{ employeeId, firstName, lastName, email, phone, address | null, status, hireDate, role,
positionId, position, teamId, team, managerId, managerName }`. A user's manager is their team's manager;
the topmost person has `teamId`, `managerId` and the team fields `null`.

## Endpoints

| Method | Path | Request | Notes |
|---|---|---|---|
| GET | `/me` | | `{ employeeId, firstName, lastName, availableRoles }` |
| GET | `/it/users` | query (all optional): `status`, `role`, `teamId`, `search` (name or email), `sort` (`id`\|`name`\|`email`), `order`, `limit` (1-200, default 50), `offset` | `{ total, limit, offset, users }` |
| GET | `/it/users/{id}` | | 404 if not found |
| POST | `/it/create-account` | `{ firstName, lastName, email, positionId, hireDate, phone?, address?, teamId?, role? }` | 201 with the user. 409 email used; 400 position or team does not exist. Omit `teamId` for the topmost person. Cognito emails an invite, so there is no password field |
| PATCH | `/it/users/{id}` | any of `{ firstName, lastName, email, phone (null clears), address, positionId, teamId (null = topmost) }` | Changing the email also changes it in Cognito. 409 email used; 400 position or team does not exist |
| PATCH | `/it/users/{id}/status` | `{ status }` | 400 deactivating your own account; 409 deactivating a manager whose team still has members |
| PATCH | `/it/users/{id}/role` | `{ role }` (`EMPLOYEE` or `null` = no extra role) | 400 changing your own role; 409 removing Manager from someone who still manages a team |
| POST | `/it/users/{id}/reset-password` | | Cognito emails a reset code. 409 if deactivated. `{ message }` |
| GET | `/it/teams` | | `{ teams: [{ teamId, name, managerId, managerName, memberCount }] }` |
| POST | `/it/teams` | `{ name, managerId }` | 201 with the team. 400 manager is not a Manager; 409 name taken |
| PATCH | `/it/teams/{id}` | any of `{ name, managerId, isDeleted: true }` | `isDeleted` soft deletes (204). 409 while employees are in the team; 404 if already deleted |
| GET | `/it/positions` | | `{ positions: [{ positionId, title, payGrade }] }`, no wages |

## Open questions for the backend

- **IDs:** the frontend treats `employeeId` as a string and `teamId` / `positionId` as numbers.
- **Admin password:** the UI no longer asks IT for their own password on role changes, because no endpoint accepts it.
