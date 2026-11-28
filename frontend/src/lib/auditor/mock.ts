import type { AuditorApi } from './api'
import type { AuditAction, AuditLogEntry, EmployeeMatch } from './types'

const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), 220))

const employees: EmployeeMatch[] = [
  ['1001', 'Alex', 'Morgan'], ['1002', 'Kevin', 'Romero'], ['1003', 'Dominic', 'Cheung'], ['1004', 'Victor', 'Lum'],
  ['1005', 'Balpreet', 'Sekhon'], ['1006', 'Mason', 'Young'], ['1007', 'Alice', 'Johnson'], ['1008', 'Carol', 'Lee'],
  ['1009', 'Eve', 'Park'], ['1010', 'Priya', 'Shah'],
].map(([employeeId, firstName, lastName]) => ({ employeeId, firstName, lastName, email: `${firstName}.${lastName}@example.com`.toLowerCase() }))

/** Who made each kind of change in the seed data (index into `employees`). */
const ACTORS = { it: 2, payroll: 3, manager: 5 }

type Template = { table: string; action: AuditAction; actor: number; values: (i: number) => [Record<string, unknown> | null, Record<string, unknown> | null] }

const TEMPLATES: Template[] = [
  { table: 'timesheet_entry', action: 'UPDATE', actor: ACTORS.manager, values: () => [{ status: 'SUBMITTED' }, { status: 'APPROVED' }] },
  { table: 'timesheet_entry', action: 'UPDATE', actor: ACTORS.manager, values: () => [{ status: 'SUBMITTED' }, { status: 'REJECTED', rejection_reason: 'Hours do not match the project log' }] },
  { table: 'timesheet_entry', action: 'INSERT', actor: -1, values: (i) => [null, { work_date: isoDay(i), hours: 7.5, status: 'DRAFT' }] },
  { table: 'employee', action: 'UPDATE', actor: ACTORS.it, values: () => [{ role: 'EMPLOYEE' }, { role: 'MANAGER' }] },
  { table: 'employee', action: 'UPDATE', actor: -1, values: () => [{ phone: '604-555-0142' }, { phone: '778-555-0199' }] },
  { table: 'employee', action: 'UPDATE', actor: ACTORS.it, values: () => [{ status: 'ACTIVE' }, { status: 'DEACTIVATED' }] },
  { table: 'direct_deposit', action: 'UPDATE', actor: -1, values: () => [{ transit_no: '01234', account_last4: '4410' }, { transit_no: '05520', account_last4: '9081' }] },
  { table: 'project_assignment', action: 'INSERT', actor: ACTORS.manager, values: () => [null, { project_id: 3, employee_id: 1007 }] },
  { table: 'project', action: 'UPDATE', actor: ACTORS.manager, values: () => [{ name: 'Mobile App' }, { name: 'Mobile App v2' }] },
  { table: 'team', action: 'INSERT', actor: ACTORS.it, values: () => [null, { name: 'Quality', manager_id: 1006 }] },
  { table: 'project_assignment', action: 'DELETE', actor: ACTORS.manager, values: () => [{ project_id: 2, employee_id: 1009 }, null] },
  { table: 'auditor', action: 'INSERT', actor: ACTORS.it, values: () => [null, { first_name: 'Jordan', last_name: 'Blake', email: 'jordan.blake@audit.example.com' }] },
]

function isoDay(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

// About 1.5 changes a day for the last 150 days, newest first, in a fixed pseudo-random pattern.
const LOGS: AuditLogEntry[] = Array.from({ length: 220 }, (_, i) => {
  const t = TEMPLATES[(i * 7 + (i % 5)) % TEMPLATES.length]
  const subject = employees[(i * 3 + Math.floor(i / 10)) % employees.length]
  const actor = t.actor === -1 ? subject : employees[t.actor]
  const [oldValues, newValues] = t.values(Math.floor(i / 1.5))
  const recordId = t.table === 'employee' || t.table === 'direct_deposit' ? subject.employeeId : String(5000 + i * 13)
  const changedAt = new Date(Date.now() - i * 16.3 * 3600000 - ((i * 37) % 60) * 60000).toISOString()
  return {
    auditId: `a1b2c3d4-${String(i).padStart(4, '0')}-4000-8000-${String(100000000000 + i * 7919).slice(0, 12)}`,
    table: t.table, recordId, action: t.action, changedBy: Number(actor.employeeId), changedByName: `${actor.firstName} ${actor.lastName}`,
    changedAt, oldValues, newValues,
  }
})

/** The YYYY-MM-DD of an ISO timestamp in BC time, as the backend filters. */
const bcDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' })

export const mockApi: AuditorApi = {
  listAuditLogs: ({ from, to, table, recordId, changedBy, action, limit = 50, nextToken } = {}) => {
    const matches = LOGS.filter((l) => {
      const day = bcDay(l.changedAt)
      return (!from || day >= from) && (!to || day <= to) && (!table || l.table === table) && (!recordId || l.recordId === recordId)
        && (!changedBy || String(l.changedBy) === changedBy) && (!action || l.action === action)
    })
    const start = nextToken ? Number(nextToken) : 0
    const end = start + limit
    return delay({ logs: matches.slice(start, end), nextToken: end < matches.length ? String(end) : null })
  },
  searchEmployees: (search, limit = 20) => {
    const q = search.trim().toLowerCase()
    return delay(employees.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.email.includes(q)).slice(0, limit))
  },
}
