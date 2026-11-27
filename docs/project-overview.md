# Project overview

## Structure

This repository currently contains a React 19 / TypeScript frontend built with Vite.
React Router defines the landing page, mock login, and role-specific portal routes in
`frontend/src/App.tsx`. There is no backend implementation in this checkout.

| Area | Responsibility |
|---|---|
| `frontend/src/pages/employee` | Time entry/submission, earnings dashboard, pay stubs, profile |
| `frontend/src/pages/it` | Account creation, roles, titles, status, credentials |
| `frontend/src/pages/manager` | Team timesheet review, projects and assignments, team directory |
| `frontend/src/pages/payroll_admin` | Payroll dashboard, employee directory and records, payroll releases, positions, and stat holidays |
| `frontend/src/lib/{employee,it,manager}` | Typed API contracts, mock implementations, placeholder sessions, domain helpers |
| `frontend/src/lib/payroll_admin` | Payroll Admin API types/client, mock data, and domain helpers |
| `frontend/src/components/ui` | Shared Radix/shadcn-style controls, cards, tables, sidebar, dialogs, charts |
| `frontend/src/components/it` | Reusable IT-specific tables and dialogs |
| `frontend/src/components/PageHeader.tsx` | Shared page heading and action layout |
| `frontend/src/index.css` | Tailwind setup, shared theme tokens and light/dark styles |
| `docs/*-api.md` | Proposed backend contracts |

The Payroll Admin portal is available under `/payroll` and uses a dedicated layout and API layer.
Its API contract is documented in [`payroll-admin-api.md`](payroll-admin-api.md). Employee pay-stub
PDFs are generated in the browser with jsPDF.

## Portal patterns

Each portal owns a layout and domain-specific pages, types, API interface, and mock implementation.
`VITE_API_BASE_URL` selects HTTP instead of a browser mock. Shared UI components supply typography,
spacing, colors, tables, cards, dialogs, notifications, and responsive sidebars. Manager follows the
IT layout structure and uses shared employee date/hour formatting helpers.

Manager has Dashboard, Timesheets, Projects, and Team routes under `/manager`. Approvals/rejections
operate on whole employee pay periods. Project management includes creation, rename, close/reopen,
restricted soft deletion, viewing assignments, and assigning active team members or the manager.
Its seeded data persists in `mock.manager.v1` in localStorage.

Payroll Admin has Dashboard, Employee Directory, Employee Records, Payroll Releases, Positions, and
Stat Holidays views under `/payroll`. The Dashboard summarizes employee and current pay-period
readiness metrics; there is no Payroll Admin Audit Log page or route. The employee views support period-aware pay
aggregation and filters. Payroll Releases displays periods and release eligibility and calls the
period release endpoint; positions and stat holidays use their documented management endpoints.
The mock implementation supports local portal workflows when `VITE_API_BASE_URL` is not configured.

## Review findings and backend integration work

1. **Production authentication and authorization need environment and backend integration.** The frontend
   has Cognito login/session and role-aware portal flows, but a deployment still needs valid Cognito and
   API configuration, working token forwarding, and backend enforcement of roles, team membership,
   project ownership, and payroll locks. Confirm the active-role header/session convention across clients.
2. **Mock data is isolated by portal.** Manager matches the IT seed's names/IDs, but stores its own data.
   Employee submissions do not appear automatically in Manager, and manager approvals do not update
   the employee store. This demo is for exercising Manager workflows independently.
3. **The workbook is newer than parts of the existing contracts.** Manager uses the newer whole-period
   review routes and project resource routes. The workbook uses numeric project codes while employee
   mocks use formatted strings such as `PRJ-100`. Normalize these when agreeing on backend shapes.
   No existing employee/IT contract was rewritten as part of Manager work.
4. **Pay-period selection needs an authorized schedule source.** Existing employee code correctly asks
   its API for backend-owned periods. The workbook has no manager schedule endpoint. Manager starts
   with a clearly documented demo period; live integration must supply period boundaries and enforce
   review eligibility rather than trusting dates entered in the browser.
5. **Build/lint have warnings.** Vite reports the existing `__dirname` configuration and large output chunks.
   Oxlint reports Fast Refresh/export and React-effect/purity warnings across existing files and portals.
   These are warnings, not build errors.

## Validation

From `frontend`:

```text
npm.cmd run build
npm.cmd run lint
npm.cmd run test:manager
```

Manager checks exercise filters, pagination, whole-period review guards and transitions, unique codes,
project deletion/closing rules, assignment eligibility/idempotence, and persistence writes. They use
an in-memory localStorage stand-in and do not modify browser demo data. They do not replace browser
interaction testing or authenticated backend integration tests.

## Deployment

Two GitHub Actions workflows, each deploying its own CloudFormation stack in us-west-2:

| Workflow | Runs on | Does |
|---|---|---|
| `Backend` (`deploy-backend.yml`) | changes under `backend/` | pytest, then `sam deploy` of `backend/template.yaml` (stack `Timely`: API, Lambdas, database, Cognito) |
| `Frontend` (`deploy-frontend.yml`) | changes under `frontend/`, and after each successful backend deploy | lint, UI tests, manager checks and build; on `main`, deploys `frontend/infra/template.yaml` (stack `TimelyWeb`: S3 bucket + CloudFront), then builds against both stacks and publishes the app |

Keeping the hosting in its own stack means a backend template change can't delete the site.
The built app sits in a private S3 bucket behind CloudFront (`TimelyWeb` stack output `WebsiteUrl`). CloudFront also
forwards `/prod/*` to API Gateway, so the deployed app calls the API on its own origin (`WebApiUrl`).
The build settings (`VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`) are read
from the stack outputs during the deploy; they are public values, so there are no secrets to store.
For local development, `.env.local` still points at the API Gateway URL directly.

