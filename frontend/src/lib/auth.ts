// Cognito sign-in shared by every portal. Sign-in is only required when the app talks to the real
// API (VITE_API_BASE_URL set); with the in-browser mocks there is nothing to protect.
import { apiError } from '@/lib/api-error'
import { User, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

export type Role = 'EMPLOYEE' | 'MANAGER' | 'PAYROLL_ADMIN' | 'IT'

/** GET /me: who is signed in and which portals they can open. */
export interface Me {
  employeeId: string
  firstName: string
  lastName: string
  availableRoles: Role[]
}

const env = import.meta.env
const API_BASE_URL = (env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || undefined
const USER_POOL_ID = env.VITE_COGNITO_USER_POOL_ID as string | undefined
const CLIENT_ID = env.VITE_COGNITO_CLIENT_ID as string | undefined
const DOMAIN = (env.VITE_COGNITO_DOMAIN as string | undefined)?.replace(/\/+$/, '')

export const authEnabled = !!(API_BASE_URL && USER_POOL_ID && CLIENT_ID && DOMAIN)

const region = USER_POOL_ID?.split('_')[0]
const authority = `https://cognito-idp.${region}.amazonaws.com/${USER_POOL_ID}`
const appRoot = `${window.location.origin}/` // must match a callback URL on the Cognito app client

export const oidcConfig: UserManagerSettings = {
  authority,
  client_id: CLIENT_ID ?? '',
  redirect_uri: appRoot,
  post_logout_redirect_uri: appRoot,
  response_type: 'code', // authorization code + PKCE
  scope: 'openid email profile',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true, // uses the refresh token before the 60-minute ID token expires
}

/** Where oidc-client-ts keeps the signed-in user (see userStore above). */
const userStorageKey = `oidc.user:${authority}:${CLIENT_ID}`

/** The signed-in user's ID token, read from storage so plain API modules can use it without React. */
export function currentIdToken(): string | undefined {
  if (!authEnabled) return undefined
  const raw = window.sessionStorage.getItem(userStorageKey)
  if (!raw) return undefined
  const user = User.fromStorageString(raw)
  return user.expired ? undefined : user.id_token
}

/** Added to every API call. API Gateway's Cognito authorizer reads the raw ID token (no "Bearer"). */
export function authHeaders(): Record<string, string> {
  const token = currentIdToken()
  return token ? { Authorization: token } : {}
}

/** Cognito's hosted logout, which also ends the Cognito session so the next sign-in asks for a password. */
const cognitoLogoutUrl = () =>
  `${DOMAIN}/logout?client_id=${encodeURIComponent(CLIENT_ID ?? '')}&logout_uri=${encodeURIComponent(appRoot)}`

/**
 * Sign out of the app and of Cognito.
 *
 * The stored user is cleared directly rather than through react-oidc-context's removeUser(): that would
 * re-render the current portal as signed out, its guard would start a new sign-in, and because the
 * Cognito session is still alive it would sign straight back in before the logout redirect ran (a loop).
 * Leaving React unaware means nothing can redirect; the page unloads and comes back from Cognito signed out.
 */
export function signOutEverywhere() {
  window.sessionStorage.removeItem(userStorageKey)
  window.location.replace(cognitoLogoutUrl())
}

export async function fetchMe(): Promise<Me> {
  // Everyone holds EMPLOYEE, so it's always a valid role to ask with.
  const res = await fetch(`${API_BASE_URL}/me`, { headers: { ...authHeaders(), 'X-Active-Role': 'EMPLOYEE' } })
  if (!res.ok) throw await apiError(res)
  const me = (await res.json()) as Omit<Me, 'employeeId'> & { employeeId: string | number }
  return { ...me, employeeId: String(me.employeeId) }
}

/** Stand-in user for mock mode: can open every portal. */
export const MOCK_ME: Me = {
  employeeId: 'E1001',
  firstName: 'Alex',
  lastName: 'Morgan',
  availableRoles: ['EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'IT'],
}
