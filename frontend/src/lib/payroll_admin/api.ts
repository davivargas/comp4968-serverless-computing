import { apiError } from '@/lib/api-error'
import { authHeaders } from '@/lib/auth'
import { mockApi } from './mock'
import type { AuditLogResult, CreatePositionInput, EmployeeFilters, EmployeeListResult, EmployeeRecord, PayAggregate, PayPeriod, PayrollEmployee, PayrollReleaseResult, PayStub, Position, StatHoliday } from './types'

export interface PayrollAdminApi {
  listEmployees(filters?: EmployeeFilters): Promise<EmployeeListResult>
  getEmployee(id: string): Promise<EmployeeRecord>
  listPositions(): Promise<Position[]>
  createPosition(input: CreatePositionInput): Promise<Position>
  updatePosition(id: string, input: Partial<CreatePositionInput> & { isDeleted?: true }): Promise<Position | void>
  listPayPeriods(limit?: number, offset?: number): Promise<PayPeriod[]>
  releasePayroll(payPeriodId: string): Promise<PayrollReleaseResult>
  listStatHolidays(year?: number): Promise<StatHoliday[]>
  addStatHoliday(holiday: StatHoliday): Promise<StatHoliday>
  deleteStatHoliday(date: string): Promise<void>
  listAuditLogs(params?: { from?: string; to?: string; action?: string; table?: string; recordId?: string; limit?: number; nextToken?: string }): Promise<AuditLogResult>
}

const BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '') || undefined
// `/payroll` is the frontend portal route; all payroll-admin backend calls use `/pa`.
const PA_BASE_PATH = '/pa'
const qs = (params: Record<string, string | number | undefined>) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
  return value ? `?${value}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // The backend checks X-Active-Role against the signed-in user's roles; /pa routes need PAYROLL_ADMIN.
    headers: { 'Content-Type': 'application/json', 'X-Active-Role': 'PAYROLL_ADMIN', ...(await authHeaders()), ...init?.headers },
  })
  if (!response.ok) throw await apiError(response)
  return response.status === 204 ? (undefined as T) : response.json()
}
const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

type BackendEmployee = {
  employeeId: string | number
  firstName: string
  lastName: string
  status: 'ACTIVE' | 'DEACTIVATED'
  positionId: string
  position: string
  teamId: string | null
  team: string
  projectId?: string | null
  project?: string | null
  email?: string | null
  phone?: string | null
  address?: string | { street?: string; city?: string; province?: string; postalCode?: string; country?: string } | null
  hireDate?: string
  managerId?: string | null
  managerName?: string | null
  payGrade?: string
  hourlyRate?: number
  depositAccountLast4?: string | null
  hours: number
  gross: number
  deductions: number
  net: number
}

const statusOf = (status: BackendEmployee['status']): PayrollEmployee['status'] => status === 'ACTIVE' ? 'active' : 'inactive'
const formatAddress = (address: BackendEmployee['address']): string | null => {
  if (typeof address === 'string') return address
  if (!address) return null
  return [address.street, address.city, address.province, address.postalCode, address.country].filter(Boolean).join(', ') || null
}
const normalizeEmployee = (employee: BackendEmployee): PayrollEmployee => ({
  id: String(employee.employeeId), employeeId: String(employee.employeeId), firstName: employee.firstName, lastName: employee.lastName,
  name: `${employee.firstName} ${employee.lastName}`, email: employee.email ?? null, position: employee.position, positionId: employee.positionId,
  teamId: employee.teamId, team: employee.team, projectId: employee.projectId ?? null, project: employee.project ?? employee.projectId ?? null,
  managerName: employee.managerName ?? null, status: statusOf(employee.status), hours: employee.hours, gross: employee.gross,
  deductions: employee.deductions, net: employee.net,
})
const normalizeDetail = (result: { employee: BackendEmployee; aggregationPeriod: string; aggregate: PayAggregate; payStubs: PayStub[] }): EmployeeRecord => {
  const employee = normalizeEmployee(result.employee)
  return {
    ...employee, email: result.employee.email ?? '', phone: result.employee.phone ?? null, address: formatAddress(result.employee.address),
    hireDate: result.employee.hireDate ?? '', startDate: result.employee.hireDate ?? '', payGrade: result.employee.payGrade ?? '', totalHours: result.aggregate.hours,
    ytdGross: result.aggregate.gross, lastPayPeriod: result.aggregationPeriod, depositAccountLast4: result.employee.depositAccountLast4 ?? null,
    hourlyRate: result.employee.hourlyRate ?? 0, aggregate: result.aggregate, payStubs: result.payStubs,
  }
}

const httpApi: PayrollAdminApi = {
  listEmployees: (filters) => request<{ total: number; aggregationPeriod: string; limit: number; offset: number; employees: BackendEmployee[] }>(`${PA_BASE_PATH}/employees${qs({ ...filters })}`).then((r): EmployeeListResult => ({ ...r, employees: r.employees.map(normalizeEmployee) })),
  getEmployee: (id) => request<{ employee: BackendEmployee; aggregationPeriod: string; aggregate: PayAggregate; payStubs: PayStub[] }>(`${PA_BASE_PATH}/employees/${id}`).then(normalizeDetail),
  listPositions: () => request<{ positions: Position[] }>(`${PA_BASE_PATH}/positions`).then((r) => r.positions),
  createPosition: (input) => request<Position>(`${PA_BASE_PATH}/positions`, send('POST', input)),
  updatePosition: (id, input) => request<Position | void>(`${PA_BASE_PATH}/positions/${id}`, send('PATCH', input)),
  listPayPeriods: (limit, offset) => request<{ payPeriods: PayPeriod[] }>(`${PA_BASE_PATH}/pay-periods${qs({ limit, offset })}`).then((r) => r.payPeriods),
  releasePayroll: (id) => request<PayrollReleaseResult>(`${PA_BASE_PATH}/payroll/${id}/release`, { method: 'PATCH' }),
  listStatHolidays: (year) => request<{ holidays: StatHoliday[] }>(`/stat-holidays${qs({ year })}`).then((r) => r.holidays),
  addStatHoliday: (holiday) => request<StatHoliday>(`${PA_BASE_PATH}/stat-holidays`, send('POST', holiday)),
  deleteStatHoliday: (date) => request<void>(`${PA_BASE_PATH}/stat-holidays/${date}`, { method: 'DELETE' }),
  listAuditLogs: (params = {}) => request<AuditLogResult>(`/audit/logs${qs(params)}`),
}

export const payrollAdminApi: PayrollAdminApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
