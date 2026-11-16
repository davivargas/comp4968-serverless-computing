# Frontend UI tests

Run from `frontend` after `npm.cmd ci`:

```powershell
npm.cmd run test:ui
npm.cmd run test:ui:types
```

For interactive reruns during development:

```powershell
npm.cmd run test:ui:watch
```

Run a particular suite or test:

```powershell
npm.cmd run test:ui -- tests/manager/projects.test.tsx
npm.cmd run test:ui -- -t "assigns an active employee"
```

## What these tests exercise

Vitest renders the real React components into jsdom. React Testing Library queries the accessible
buttons, inputs, dialogs, and tables. `user-event` clicks, types, and selects options as a user would.
Assertions check visible state changes and the API calls produced by interactions.

The API modules are replaced with per-test fixtures, and a session provider supplies manager Kevin
with ID `42`. No Cognito login or deployed API access is needed; `.env.local` can remain configured
for the live application. Tests do not create real accounts, projects, or employee assignments.
Each test cleans up rendered components and resets its API fixtures. There are no fixed sleep delays.

| Suite | Coverage |
|---|---|
| `manager/projects.test.tsx` | Create with explicit/generated code; required name; cancel; duplicate-code errors; rename; close/reopen; delete confirmation; active employee assignment; displaying assigned names and count; excluding inactive/already assigned options; authenticated self option; disabling deletion for assigned projects; closed-project guards; error/retry; busy save controls; assignment removal confirmation/cancel, membership/count refresh, error recovery, and removal from closed projects |
| `manager/timesheets.test.tsx` | Per-employee summary hours/days; opening detail by button or row; individual dates/projects; close; employee/status filters; confirm/cancel approval; return for changes; unsubmitted/partial submission guards; review errors; previous/next periods; complete API pagination; load retry |
| `manager/team.test.tsx` | Signed-in manager ID used for team request; employee names, team, and inactive status |
| `manager/dashboard.test.tsx` | All three quick-action links navigate to their respective routes |
| `manager/layout.test.tsx` | Authenticated greeting rather than Alice; real-API indicator; sidebar navigation destinations |

`tests/setup.ts` supplies missing jsdom browser APIs for Radix and Sonner. These shims do not
replace the actual project forms, dialogs, tables, or notifications being tested.
`tsconfig.test.json` checks test code separately without including it in the production build.

## Other checks

```powershell
npm.cmd run test:manager
npm.cmd run build
npm.cmd run lint
```

The existing `test:manager` script exercises the mock API/domain rules. UI tests complement it by
exercising rendered interactions. Neither suite proves deployed backend behavior, Cognito password
flows, browser CSS/layout, responsive rendering, or full end-to-end connectivity. Those still need
real-browser and backend integration checks. Employee, IT, and Payroll Admin UI workflows are outside
this manager-focused suite.
