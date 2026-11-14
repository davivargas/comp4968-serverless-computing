import { apiError } from '@/lib/api-error'
import { authHeaders } from '@/lib/auth'
import { mockApi } from './mock'
import { CURRENT_MANAGER } from './session'
import type { ManagedEmployee, ManagerProject, ManagerTimesheet, PeriodInput, ProjectEmployees, ProjectInput, ProjectUpdate, TimesheetList, TimesheetQuery } from './types'

export interface ManagerApi {
  listTimesheets(query?: TimesheetQuery): Promise<TimesheetList>
  getTimesheet(id: string): Promise<ManagerTimesheet>
  reviewPeriod(employeeId: string, action: 'approve' | 'reject', period: PeriodInput): Promise<{ entries: ManagerTimesheet[] }>
  listEmployees(projectId?: string): Promise<ManagedEmployee[]>
  listProjects(): Promise<ManagerProject[]>
  createProject(input: ProjectInput): Promise<ManagerProject>
  updateProject(id: string, input: ProjectUpdate): Promise<ManagerProject | void>
  projectEmployees(id: string): Promise<ProjectEmployees>
  assignEmployee(projectId: string, employeeId: string): Promise<{ projectId: string; employeeId: string; alreadyAssigned: boolean }>
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Active-Role': 'MANAGER', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw await apiError(response)
  return response.status === 204 ? undefined as T : response.json()
}
const httpApi: ManagerApi = {
  listTimesheets: (query = {}) => {
    const params = new URLSearchParams()
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)) })
    return request(`/manager/timesheets?${params}`)
  },
  getTimesheet: (id) => request(`/manager/timesheets/${encodeURIComponent(id)}`),
  reviewPeriod: (id, action, period) => request(`/manager/employees/${encodeURIComponent(id)}/timesheets/${action}`, 'PATCH', period),
  listEmployees: (projectId) => request<{ employees: ManagedEmployee[] }>(`/manager/${CURRENT_MANAGER.id}/employees${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`).then(r => r.employees),
  listProjects: () => request<{ projects: ManagerProject[] }>('/manager/projects').then(r => r.projects),
  createProject: (input) => request('/manager/projects', 'POST', input),
  updateProject: (id, input) => request(`/manager/projects/${encodeURIComponent(id)}`, 'PATCH', input),
  projectEmployees: (id) => request(`/manager/projects/${encodeURIComponent(id)}/employees`),
  assignEmployee: (id, employeeId) => request(`/manager/${encodeURIComponent(id)}/assign-employee`, 'POST', { employeeId }),
}
export const managerApi: ManagerApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
