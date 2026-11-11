import { mockApi } from './mock'
import type { CreatePositionInput, EmployeeFilters, EmployeeRecord, PayPeriod, PayrollEmployee, Position } from './types'

export interface PayrollAdminApi {
  listEmployees(filters?: EmployeeFilters): Promise<PayrollEmployee[]>
  getEmployee(id: string): Promise<EmployeeRecord>
  listPositions(): Promise<Position[]>
  createPosition(input: CreatePositionInput): Promise<Position>
  updatePosition(id: string, input: Partial<CreatePositionInput> & { isDeleted?: true }): Promise<Position | void>
  listPayPeriods(limit?: number, offset?: number): Promise<PayPeriod[]>
  releasePayroll(payPeriodId: string): Promise<void>
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined
// `/payroll` is the frontend portal route; all payroll-admin backend calls use `/pa`.
const PA_BASE_PATH = '/pa'
const qs = (params: Record<string, string | number | undefined>) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()
  return value ? `?${value}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`)
  return response.status === 204 ? (undefined as T) : response.json()
}
const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

const httpApi: PayrollAdminApi = {
  listEmployees: (filters) => request<{ employees: PayrollEmployee[] }>(`${PA_BASE_PATH}/employees${qs({ position: filters?.position, team: filters?.team, from: filters?.from, to: filters?.to, search: filters?.search })}`).then((r) => r.employees),
  getEmployee: (id) => request<EmployeeRecord>(`${PA_BASE_PATH}/employees/${id}`),
  listPositions: () => request<{ positions: Position[] }>(`${PA_BASE_PATH}/positions`).then((r) => r.positions),
  createPosition: (input) => request(`${PA_BASE_PATH}/positions`, send('POST', input)),
  updatePosition: (id, input) => request(`${PA_BASE_PATH}/positions/${id}`, send('PATCH', input)),
  listPayPeriods: (limit, offset) => request<{ payPeriods: PayPeriod[] }>(`${PA_BASE_PATH}/pay-periods${qs({ limit, offset })}`).then((r) => r.payPeriods),
  releasePayroll: (id) => request(`${PA_BASE_PATH}/payroll/${id}/release`, { method: 'PATCH' }),
}

export const payrollAdminApi: PayrollAdminApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
