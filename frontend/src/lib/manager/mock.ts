import type { ManagerApi } from './api'
import type { ManagedEmployee, ManagerProject, ManagerTimesheet } from './types'

const employees: ManagedEmployee[] = [
  { employeeId: 'E1001', firstName: 'Alex', lastName: 'Morgan', email: 'alex.morgan@example.com', status: 'ACTIVE', position: 'Software Engineer 2', team: 'Engineering' },
  { employeeId: 'E1003', firstName: 'Carol', lastName: 'Lee', email: 'carol.lee@example.com', status: 'ACTIVE', position: 'Senior Software Engineer', team: 'Engineering' },
  { employeeId: 'E1005', firstName: 'Eve', lastName: 'Park', email: 'eve.park@example.com', status: 'INACTIVE', position: 'Software Engineer 1', team: 'Engineering' },
]
const seed = {
  projects: [
    { projectId: 'P100', projectCode: 100, name: 'Payroll Platform', status: 'ACTIVE', employeeCount: 2 },
    { projectId: 'P200', projectCode: 200, name: 'Mobile App', status: 'ACTIVE', employeeCount: 1 },
    { projectId: 'P300', projectCode: 300, name: 'Data Warehouse', status: 'CLOSED', employeeCount: 0 },
  ] as ManagerProject[],
  assignments: { P100: ['E1001', 'E1003'], P200: ['E1001'], P300: [] } as Record<string, string[]>,
  deleted: [] as string[],
  timesheets: employees.slice(0, 2).flatMap((e, i) => [0, 1, 2].map(day => ({
    timesheetId: `M-${i}-${day}`, employeeId: e.employeeId, employeeName: `${e.firstName} ${e.lastName}`,
    date: `2026-11-${String(9 + day).padStart(2, '0')}`, startTime: '09:00', endTime: '17:00',
    projectCode: '100', projectName: 'Payroll Platform', submitted: i === 0 || day !== 2, approved: i === 1 && day === 0,
  }))) as ManagerTimesheet[],
}
const KEY = 'mock.manager.v1'
let state = structuredClone(seed)
try { const raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw) } catch { /* use seed */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* retain in memory */ } }
const result = async <T>(value: T): Promise<T> => structuredClone(value)
const project = (id: string) => {
  const found = state.projects.find(p => p.projectId === id && !state.deleted.includes(id))
  if (!found) throw new Error('Project not found')
  return found
}

export const mockApi: ManagerApi = {
  async listTimesheets(q = {}) {
    const limit = Math.min(200, Math.max(1, q.limit ?? 50)), offset = Math.max(0, q.offset ?? 0)
    const rows = state.timesheets.filter(t => (!q.employeeId || t.employeeId === q.employeeId)
      && (!q.from || t.date >= q.from) && (!q.to || t.date <= q.to)
      && (!q.status || (q.status === 'pending' ? t.submitted && !t.approved : q.status === 'approved' ? t.approved : !t.submitted)))
    rows.sort((a, b) => (q.sort === 'employee' ? a.employeeName.localeCompare(b.employeeName) : a.date.localeCompare(b.date)) * (q.order === 'asc' ? 1 : -1))
    return result({ timesheets: rows.slice(offset, offset + limit), limit, offset })
  },
  async getTimesheet(id) {
    const row = state.timesheets.find(t => t.timesheetId === id)
    if (!row) throw new Error('Timesheet not found')
    return result(row)
  },
  async reviewPeriod(id, action, { from, to }) {
    // Matches the employee mock's biweekly anchor; the real backend owns this validation.
    const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86400000
    const anchor = day('2025-01-06')
    if (!Number.isFinite(day(from)) || !Number.isFinite(day(to)) || from > to
      || (day(from) - anchor) % 14 !== 0 || day(to) - day(from) !== 13) throw new Error('Select a complete biweekly pay period (14 days, starting Monday)')
    const rows = state.timesheets.filter(t => t.employeeId === id && t.date >= from && t.date <= to)
    if (!rows.some(t => t.submitted) || (action === 'approve' && rows.some(t => !t.submitted))) throw new Error('Approval requires every entry to be submitted; rejection requires submitted entries')
    rows.forEach(t => { t.submitted = action === 'approve'; t.approved = action === 'approve' })
    save()
    return result({ entries: rows })
  },
  async listEmployees(projectId) { return result(employees.filter(e => !projectId || (project(projectId) && state.assignments[projectId].includes(e.employeeId)))) },
  async listProjects() { return result(state.projects.filter(p => !state.deleted.includes(p.projectId))) },
  async createProject(input) {
    if (!input.name.trim()) throw new Error('Project name is required')
    const code = input.projectCode ?? Math.max(0, ...state.projects.map(p => p.projectCode)) + 1
    if (!Number.isSafeInteger(code) || code < 1) throw new Error('Project code must be a positive integer')
    if (state.projects.some(p => p.projectCode === code)) throw new Error('Project code is already used')
    const p: ManagerProject = { projectId: crypto.randomUUID(), projectCode: code, name: input.name.trim(), status: 'ACTIVE', employeeCount: 0 }
    state.projects.push(p); state.assignments[p.projectId] = []; save()
    return result(p)
  },
  async updateProject(id, input) {
    const p = project(id)
    if (input.isDeleted) {
      if (p.employeeCount || state.timesheets.some(t => t.projectCode === String(p.projectCode))) throw new Error('Project is in use; close it instead')
      state.deleted.push(id); save(); return
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new Error('Project name is required')
      p.name = input.name.trim()
    }
    if (input.status) p.status = input.status
    save(); return result(p)
  },
  async projectEmployees(id) {
    const p = project(id)
    const eligible = [...employees, { employeeId: 'E1002', firstName: 'Alice', lastName: 'Johnson', status: 'ACTIVE' as const }]
    return result({ projectId: id, projectCode: p.projectCode, employees: eligible.filter(e => state.assignments[id].includes(e.employeeId)).map(({ employeeId, firstName, lastName, status }) => ({ employeeId, firstName, lastName, status })) })
  },
  async assignEmployee(id, employeeId) {
    const p = project(id)
    if (p.status !== 'ACTIVE') throw new Error('Closed projects cannot accept assignments')
    if (employeeId !== 'E1002' && !employees.some(e => e.employeeId === employeeId && e.status === 'ACTIVE')) throw new Error('Choose an active team member or yourself')
    const alreadyAssigned = state.assignments[id].includes(employeeId)
    if (!alreadyAssigned) { state.assignments[id].push(employeeId); p.employeeCount++; save() }
    return result({ projectId: id, employeeId, alreadyAssigned })
  },
}
