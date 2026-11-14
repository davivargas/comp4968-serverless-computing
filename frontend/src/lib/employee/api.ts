import { apiError } from '@/lib/api-error'
import { authHeaders } from '@/lib/auth'
import { MONTHS } from './dates'
import { mockApi } from './mock'
import type {
  AggregatePay, EmployeeProfile, Granularity, ISODate, NewTimesheetEntry, PayPeriod, PayStub, PayStubSummary,
  ProfileUpdate, Project, TimesheetEntry,
} from './types'

/**
 * Employee API client. When VITE_API_BASE_URL is unset (local dev, before the backend
 * exists) every call is served by an in-browser mock backed by localStorage.
 */
export interface EmployeeApi {
  getProjects(employeeId: string, search?: string): Promise<Project[]>
  /** The pay period containing `date` (default: today, i.e. the current period). */
  getPayPeriod(employeeId: string, date?: ISODate): Promise<PayPeriod>
  getTimesheets(employeeId: string, from: ISODate, to: ISODate): Promise<TimesheetEntry[]>
  createTimesheets(employeeId: string, entries: NewTimesheetEntry[]): Promise<TimesheetEntry[]>
  deleteTimesheet(employeeId: string, timesheetId: string): Promise<void>
  submitTimesheets(employeeId: string, from: ISODate, to: ISODate): Promise<TimesheetEntry[]>
  getAggregatePay(employeeId: string, year: number, granularity: Granularity): Promise<AggregatePay>
  getPayStubs(employeeId: string, from: ISODate, to: ISODate): Promise<PayStubSummary[]>
  getPayStub(employeeId: string, payDate: ISODate): Promise<PayStub>
  getProfile(employeeId: string): Promise<EmployeeProfile>
  updateProfile(employeeId: string, update: ProfileUpdate): Promise<EmployeeProfile>
}

// Trailing slashes are trimmed so ".../prod/" and ".../prod" both work.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || undefined

/** The backend checks this header against the signed-in user's roles. This portal is always EMPLOYEE. */
const ACTIVE_ROLE = 'EMPLOYEE'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // authHeaders() adds the Cognito ID token that API Gateway checks before any Lambda runs.
    headers: { 'Content-Type': 'application/json', 'X-Active-Role': ACTIVE_ROLE, ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) throw await apiError(res)
  return res.status === 204 ? (undefined as T) : res.json()
}

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString()
  return s ? `?${s}` : ''
}

/**
 * The backend labels periods "2026-03", "2026-Q1" and "YTD"; the dashboard's dropdowns and tables use
 * "Mar", "Q1" and "2026". Convert here so the pages work the same with the real API and the mock.
 */
function displayLabel(label: string, granularity: Granularity, year: number) {
  if (granularity === 'ytd') return String(year)
  const quarter = /Q([1-4])$/.exec(label)
  if (granularity === 'quarterly' && quarter) return `Q${quarter[1]}`
  const month = /-(\d{2})$/.exec(label)
  if (granularity === 'monthly' && month) return MONTHS[Number(month[1]) - 1] ?? label
  return label
}

export const withDisplayLabels = (data: AggregatePay): AggregatePay => ({
  ...data,
  periods: data.periods.map((p) => ({ ...p, label: displayLabel(p.label, data.granularity, data.year) })),
})

const httpApi: EmployeeApi = {
  getProjects: (id, search) => request<{ projects: Project[] }>(`/employee/${id}/projects${qs({ search })}`).then((r) => r.projects),
  getPayPeriod: (id, date) => request(`/employee/${id}/pay-period${qs({ date })}`),
  getTimesheets: (id, from, to) => request<{ entries: TimesheetEntry[] }>(`/employee/${id}/timesheets${qs({ from, to })}`).then((r) => r.entries),
  createTimesheets: (id, entries) =>
    request<{ entries: TimesheetEntry[] }>(`/employee/${id}/timesheets`, { method: 'POST', body: JSON.stringify({ entries }) }).then((r) => r.entries),
  deleteTimesheet: (id, timesheetId) => request(`/employee/${id}/timesheets/${timesheetId}`, { method: 'DELETE' }),
  submitTimesheets: (id, from, to) =>
    request<{ entries: TimesheetEntry[] }>(`/employee/${id}/timesheets/submit`, { method: 'PATCH', body: JSON.stringify({ from, to }) }).then((r) => r.entries),
  getAggregatePay: (id, year, granularity) =>
    request<AggregatePay>(`/employee/${id}/aggregate-pay${qs({ year, granularity })}`).then(withDisplayLabels),
  getPayStubs: (id, from, to) => request<{ payStubs: PayStubSummary[] }>(`/employee/${id}/pay-stubs${qs({ from, to })}`).then((r) => r.payStubs),
  getPayStub: (id, payDate) => request(`/employee/${id}/pay-stubs/${payDate}`),
  getProfile: (id) => request(`/employee/${id}/profile`),
  updateProfile: (id, update) => request(`/employee/${id}/profile`, { method: 'PATCH', body: JSON.stringify(update) }),
}

export const employeeApi: EmployeeApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
