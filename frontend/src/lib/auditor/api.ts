import { apiError } from '@/lib/api-error'
import { authHeaders } from '@/lib/auth'
import { mockApi } from './mock'
import type { AuditLogQuery, AuditLogResult, EmployeeMatch } from './types'

export interface AuditorApi {
  listAuditLogs(query?: AuditLogQuery): Promise<AuditLogResult>
  searchEmployees(search: string, limit?: number): Promise<EmployeeMatch[]>
}

const BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/+$/, '') || undefined

const qs = (params: object) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
  const value = new URLSearchParams(entries).toString()
  return value ? `?${value}` : ''
}

async function request<T>(path: string): Promise<T> {
  // External auditors hold only the AUDITOR role, and /audit/employees accepts nothing else.
  const response = await fetch(`${BASE_URL}${path}`, { headers: { 'X-Active-Role': 'AUDITOR', ...(await authHeaders()) } })
  if (!response.ok) throw await apiError(response)
  return response.json() as Promise<T>
}

type RawMatch = Omit<EmployeeMatch, 'employeeId'> & { employeeId: string | number }

const httpApi: AuditorApi = {
  listAuditLogs: (query = {}) => request<AuditLogResult>(`/audit/logs${qs(query)}`),
  searchEmployees: (search, limit = 20) =>
    request<{ employees: RawMatch[] }>(`/audit/employees${qs({ search, limit })}`)
      .then((r) => r.employees.map((e) => ({ ...e, employeeId: String(e.employeeId) }))),
}

export const usingMockApi = !BASE_URL
export const auditorApi: AuditorApi = usingMockApi ? mockApi : httpApi
