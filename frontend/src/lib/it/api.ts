import { mockApi } from './mock'
import type { CreateAccountInput, Employee, ResetCredentialsInput, Role } from './types'

/**
 * IT admin API client. When VITE_API_BASE_URL is unset (local dev, before the backend
 * exists) every call is served by an in-browser mock backed by localStorage.
 * Endpoint shapes are documented in docs/it-api.md.
 */
export interface ITApi {
  listEmployees(): Promise<Employee[]>
  createAccount(input: CreateAccountInput): Promise<Employee>
  /** `adminPassword` is the acting admin's own password; required when granting or removing IT Admin. */
  changeRole(id: string, role: Role, adminPassword?: string): Promise<void>
  changeTitle(id: string, title: string): Promise<void>
  setActive(id: string, active: boolean): Promise<void>
  resetCredentials(id: string, input: ResetCredentialsInput): Promise<void>
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    // TODO: attach the Cognito ID token once auth is wired up:
    // headers: { Authorization: `Bearer ${idToken}` }
  })
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`)
  return res.status === 204 ? (undefined as T) : res.json()
}

const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

const httpApi: ITApi = {
  listEmployees: () => request<{ employees: Employee[] }>('/it/employees').then((r) => r.employees),
  createAccount: (input) => request('/it/employees', send('POST', input)),
  changeRole: (id, role, adminPassword) => request(`/it/employees/${id}/role`, send('PATCH', { role, adminPassword })),
  changeTitle: (id, title) => request(`/it/employees/${id}/title`, send('PATCH', { title })),
  setActive: (id, active) => request(`/it/employees/${id}/status`, send('PATCH', { active })),
  resetCredentials: (id, input) => request(`/it/employees/${id}/credentials`, send('PATCH', input)),
}

export const itApi: ITApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
