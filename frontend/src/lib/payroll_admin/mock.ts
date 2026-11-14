import type { PayrollAdminApi } from './api'
import type { CreatePositionInput, EmployeeFilters, EmployeeListResult, EmployeeRecord, PayAggregate, PayPeriod, PayrollEmployee, PayrollReleaseResult, PayStub, Position } from './types'

const KEY = 'mock.payroll-admin'
const delay = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(structuredClone(value)), 220))
const positions: Position[] = [
  { positionId: 'POS-001', title: 'Software Developer', payGrade: 'P2', hourlyRate: 42.5, effectiveFrom: '2026-01-01', nextWage: { hourlyRate: 45, effectiveFrom: '2027-01-01' } },
  { positionId: 'POS-002', title: 'Backend Developer', payGrade: 'P2', hourlyRate: 44, effectiveFrom: '2026-01-01', nextWage: null },
  { positionId: 'POS-003', title: 'QA Developer', payGrade: 'P1', hourlyRate: 36.5, effectiveFrom: '2026-01-01', nextWage: null },
  { positionId: 'POS-004', title: 'Project Lead', payGrade: 'P3', hourlyRate: 52, effectiveFrom: '2026-01-01', nextWage: { hourlyRate: 55, effectiveFrom: '2027-02-01' } },
  { positionId: 'POS-005', title: 'Payroll Specialist', payGrade: 'P2', hourlyRate: 39, effectiveFrom: '2026-01-01', nextWage: null },
]
const names = ['Kevin Romero', 'Dominic Cheung', 'Victor Lum', 'Balpreet Sekhon', 'Mason Young', 'Alex Morgan', 'Alice Johnson', 'Carol Lee', 'Eve Park', 'Priya Shah']
const teams = ['Engineering', 'Quality', 'Operations', 'People']
const projects = ['Payroll Platform', 'Mobile App', 'Data Warehouse', 'Internal Operations']
let employees: PayrollEmployee[] = Array.from({ length: 48 }, (_, index) => {
  const position = positions[index % positions.length]
  const name = names[index % names.length]
  const id = `EMP-${String(index + 1).padStart(3, '0')}`
  const hours = 1480; const gross = Math.round(position.hourlyRate * hours * 100) / 100; const deductions = Math.round(gross * 0.22 * 100) / 100
  return { id, employeeId: id, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' '), name, email: `${name.toLowerCase().replaceAll(' ', '.')}@example.com`, position: position.title, positionId: position.positionId, teamId: `TEAM-${index % teams.length + 1}`, team: teams[index % teams.length], projectId: `PROJ-${index % projects.length + 1}`, project: projects[index % projects.length], managerName: index % 5 === 4 ? null : 'Mason Young', status: index === 8 ? 'inactive' : 'active', hours, gross, deductions, net: Math.round((gross - deductions) * 100) / 100 }
})
let periods: PayPeriod[] = [
  { payPeriodId: 'PP-2026-22', start: '2026-11-02', end: '2026-11-15', payDate: '2026-11-20', status: 'OPEN', unapprovedCount: 6, employeeCount: 48, canRelease: false, releasedAt: null },
  { payPeriodId: 'PP-2026-21', start: '2026-10-19', end: '2026-11-01', payDate: '2026-11-06', status: 'RELEASED', unapprovedCount: 0, employeeCount: 48, canRelease: false, releasedAt: '2026-11-03T14:20:00Z' },
  { payPeriodId: 'PP-2026-20', start: '2026-10-05', end: '2026-10-18', payDate: '2026-10-23', status: 'RELEASED', unapprovedCount: 0, employeeCount: 47, canRelease: false, releasedAt: '2026-10-20T15:12:00Z' },
  { payPeriodId: 'PP-2026-19', start: '2026-09-21', end: '2026-10-04', payDate: '2026-10-09', status: 'RELEASED', unapprovedCount: 0, employeeCount: 47, canRelease: false, releasedAt: '2026-10-06T16:02:00Z' },
]
const load = () => { try { const raw = localStorage.getItem(KEY); if (raw) periods = JSON.parse(raw) as PayPeriod[] } catch { /* use seed */ } }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(periods)) } catch { /* memory fallback */ } }
load()
const filter = (list: PayrollEmployee[], f: EmployeeFilters = {}) => list.filter((e) => (!f.positionId || e.positionId === f.positionId) && (!f.teamId || e.teamId === f.teamId) && (!f.projectId || e.projectId === f.projectId) && (!f.status || (f.status === 'ACTIVE' ? e.status === 'active' : e.status === 'inactive')) && (!f.search || `${e.id} ${e.name} ${e.email ?? ''} ${e.position} ${e.project ?? ''}`.toLowerCase().includes(f.search.toLowerCase())))
const result = (list: PayrollEmployee[], f: EmployeeFilters = {}): EmployeeListResult => { const employees = filter(list, f); return { total: employees.length, aggregationPeriod: f.payDate ?? (f.year ? String(f.year) : 'current year'), limit: f.limit ?? 50, offset: f.offset ?? 0, employees } }

export const mockApi: PayrollAdminApi = {
  listEmployees: (f) => delay(result(employees, f)),
  getEmployee: (id) => { const e = employees.find((x) => x.id === id); if (!e) return Promise.reject(new Error('Employee not found')); const aggregate: PayAggregate = { hours: e.hours, gross: e.gross, deductions: e.deductions, net: e.net }; const payStubs: PayStub[] = [{ payDate: '2026-11-20', periodStart: '2026-11-02', periodEnd: '2026-11-15', ...aggregate }]; const record: EmployeeRecord = { ...e, email: e.email ?? '', phone: '+16045550142', address: '3700 Willingdon Ave, Burnaby, BC', hireDate: '2023-01-15', startDate: '2023-01-15', payGrade: 'P2', hourlyRate: 42.5, totalHours: aggregate.hours, ytdGross: aggregate.gross, lastPayPeriod: '2026', depositAccountLast4: '4567', aggregate, payStubs }; return delay(record) },
  listPositions: () => delay(positions),
  createPosition: (input: CreatePositionInput) => { if (positions.some((p) => p.title.toLowerCase() === input.title.toLowerCase())) return Promise.reject(new Error('A position with this title already exists')); const p: Position = { positionId: `POS-${String(positions.length + 1).padStart(3, '0')}`, ...input, nextWage: null }; positions.push(p); return delay(p) },
  updatePosition: (id, input) => { const p = positions.find((x) => x.positionId === id); if (!p) return Promise.reject(new Error('Position not found')); if (input.title) p.title = input.title; if (input.payGrade) p.payGrade = input.payGrade; if (input.hourlyRate && input.effectiveFrom) p.nextWage = { hourlyRate: input.hourlyRate, effectiveFrom: input.effectiveFrom }; return delay(p) },
  listPayPeriods: () => delay(periods),
  releasePayroll: (id) => { const p = periods.find((x) => x.payPeriodId === id); if (!p) return Promise.reject(new Error('Pay period not found')); if (!p.canRelease) return Promise.reject(new Error('This pay period is not ready for release')); p.status = 'RELEASED'; p.releasedAt = new Date().toISOString(); save(); const release: PayrollReleaseResult = { payPeriodId: id, status: 'RELEASED', paystubsCreated: employees.length, paystubs: employees.map((e) => ({ paystubId: `STUB-${e.id}`, employeeId: e.id, gross: e.gross, net: e.net })) }; return delay(release) },
}
