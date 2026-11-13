import { authHeaders } from '@/lib/auth'
import { mockApi } from './mock'
import type {
  CreateAccountInput, ListUsersParams, Me, Position, Role, Status, Team, TeamInput, UpdateUserInput, User, UsersPage,
} from './types'

/**
 * IT admin API client. When VITE_API_BASE_URL is unset (local dev, before the backend
 * exists) every call is served by an in-browser mock backed by localStorage.
 * Endpoint shapes are documented in docs/it-api.md.
 *
 * Errors carry the backend's message (400 bad input, 409 conflict, ...) so the UI can show it as-is.
 */
export interface ITApi {
  getMe(): Promise<Me>
  listUsers(params?: ListUsersParams): Promise<UsersPage>
  getUser(id: string): Promise<User>
  createAccount(input: CreateAccountInput): Promise<User>
  updateUser(id: string, input: UpdateUserInput): Promise<User>
  setStatus(id: string, status: Status): Promise<User>
  /** `EMPLOYEE` (or null) removes the extra role. */
  setRole(id: string, role: Role | null): Promise<User>
  /** Cognito emails the user a reset code. */
  resetPassword(id: string): Promise<{ message: string }>
  listTeams(): Promise<Team[]>
  createTeam(input: TeamInput): Promise<Team>
  updateTeam(id: number, input: Partial<TeamInput>): Promise<Team>
  /** Soft delete. Fails with 409 while employees are still in the team. */
  deleteTeam(id: number): Promise<void>
  listPositions(): Promise<Position[]>
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

/** Role sent as X-Active-Role on every call: the role chosen at login. This portal is always IT. */
const ACTIVE_ROLE: Role = 'IT'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Active-Role': ACTIVE_ROLE, ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    let message = text
    try { message = (JSON.parse(text) as { message?: string }).message ?? text } catch { /* plain text */ }
    throw new Error(message || `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })

const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString()
  return s ? `?${s}` : ''
}

const httpApi: ITApi = {
  getMe: () => request('/me'),
  listUsers: (p = {}) => request(`/it/users${qs({ ...p })}`),
  getUser: (id) => request(`/it/users/${id}`),
  createAccount: (input) => request('/it/create-account', send('POST', input)),
  updateUser: (id, input) => request(`/it/users/${id}`, send('PATCH', input)),
  setStatus: (id, status) => request(`/it/users/${id}/status`, send('PATCH', { status })),
  setRole: (id, role) => request(`/it/users/${id}/role`, send('PATCH', { role })),
  resetPassword: (id) => request(`/it/users/${id}/reset-password`, send('POST')),
  listTeams: () => request<{ teams: Team[] }>('/it/teams').then((r) => r.teams),
  createTeam: (input) => request('/it/teams', send('POST', input)),
  updateTeam: (id, input) => request(`/it/teams/${id}`, send('PATCH', input)),
  deleteTeam: (id) => request(`/it/teams/${id}`, send('PATCH', { isDeleted: true })),
  listPositions: () => request<{ positions: Position[] }>('/it/positions').then((r) => r.positions),
}

export const itApi: ITApi = BASE_URL ? httpApi : mockApi
export const usingMockApi = !BASE_URL
