import { entryHours } from '@/lib/employee/dates'
import type { ManagerApi } from './api'
import type { ManagerTimesheet, PeriodInput } from './types'

export type ReviewStatus = 'Pending' | 'Approved' | 'Unsubmitted' | 'Partially submitted'
export interface EmployeePeriodSummary {
  employeeId: string
  employeeName: string
  entries: ManagerTimesheet[]
  hours: number
  days: number
  status: ReviewStatus
  canApprove: boolean
  canReturn: boolean
}

// Read every API page before grouping; a single page could split an employee's period.
export async function loadPeriodEntries(api: Pick<ManagerApi, 'listTimesheets'>, period: PeriodInput) {
  const entries: ManagerTimesheet[] = []
  let offset = 0
  while (true) {
    const page = await api.listTimesheets({ ...period, sort: 'employee', order: 'asc', limit: 200, offset })
    entries.push(...page.timesheets)
    if (page.timesheets.length < page.limit) return entries
    if (page.limit <= 0) throw new Error('Invalid timesheet page size')
    offset += page.timesheets.length
  }
}

export function summarizePeriod(entries: ManagerTimesheet[]): EmployeePeriodSummary[] {
  const groups = new Map<string, ManagerTimesheet[]>()
  for (const entry of entries) {
    // Deployed IDs can be numbers; normalize keys to match HTML select values.
    const id = String(entry.employeeId)
    const group = groups.get(id) ?? []
    group.push(entry)
    groups.set(id, group)
  }
  return [...groups].map(([employeeId, rows]) => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    const allSubmitted = rows.every(e => e.submitted)
    const anySubmitted = rows.some(e => e.submitted)
    const allApproved = rows.every(e => e.approved)
    return {
      employeeId, employeeName: rows[0].employeeName, entries: sorted,
      hours: rows.reduce((total, e) => total + entryHours(e), 0),
      days: new Set(rows.map(e => e.date)).size,
      status: allApproved ? 'Approved' : allSubmitted ? 'Pending' : anySubmitted ? 'Partially submitted' : 'Unsubmitted',
      canApprove: allSubmitted && !allApproved, canReturn: anySubmitted,
    } satisfies EmployeePeriodSummary
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}
