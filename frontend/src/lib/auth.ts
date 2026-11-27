// Cognito sign-in shared by every portal. Sign-in is only required when the app talks to the real
// API (VITE_API_BASE_URL set); with the in-browser mocks there is nothing to protect.
//
// The app signs in through its own form, calling the Cognito user pool API directly (SRP), so the pool
// needs no hosted domain. That matters: the backend Lambdas reach Cognito through a VPC endpoint, which
// AWS refuses for pools that have a domain.
import { Amplify } from 'aws-amplify'
import {
  confirmResetPassword, confirmSignIn, fetchAuthSession, resetPassword, signIn, signOut, updatePassword,
} from 'aws-amplify/auth'
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito'
import { sessionStorage } from 'aws-amplify/utils'
import { apiError } from '@/lib/api-error'

export type Role = 'EMPLOYEE' | 'MANAGER' | 'PAYROLL_ADMIN' | 'IT' | 'AUDITOR'

/** GET /me: who is signed in and which portals they can open. */
export interface Me {
  /** Empty for external auditors, who have no employee record. */
  employeeId: string
  /** Set only for external auditors. */
  auditorId?: string
  firstName: string
  lastName: string
  availableRoles: Role[]
}

const env = import.meta.env
const API_BASE_URL = (env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || undefined
const USER_POOL_ID = env.VITE_COGNITO_USER_POOL_ID as string | undefined
const CLIENT_ID = env.VITE_COGNITO_CLIENT_ID as string | undefined

export const authEnabled = !!(API_BASE_URL && USER_POOL_ID && CLIENT_ID)

if (authEnabled) {
  Amplify.configure({ Auth: { Cognito: { userPoolId: USER_POOL_ID!, userPoolClientId: CLIENT_ID!, loginWith: { email: true } } } })
  // Tokens live for this tab only, like before: closing the tab signs you out.
  cognitoUserPoolsTokenProvider.setKeyValueStorage(sessionStorage)
}

/**
 * The signed-in user's ID token, refreshed first if it has expired (ID tokens last 60 minutes,
 * the refresh token 12 hours). Undefined when nobody is signed in.
 */
export async function currentIdToken(): Promise<string | undefined> {
  if (!authEnabled) return undefined
  try {
    return (await fetchAuthSession()).tokens?.idToken?.toString()
  } catch {
    return undefined
  }
}

/** Added to every API call. API Gateway's Cognito authorizer reads the raw ID token (no "Bearer"). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await currentIdToken()
  return token ? { Authorization: token } : {}
}

/** What the sign-in form shows next. */
export type SignInStep = 'done' | 'newPassword' | 'resetPassword'

/**
 * Email + password sign-in. Accounts IT creates start with an emailed temporary password, so the
 * first sign-in answers `newPassword` and the form asks for a new one ({@link completeNewPassword}).
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInStep> {
  const attempt = () => signIn({ username: email.trim(), password })
  let res
  try {
    res = await attempt()
  } catch (e) {
    // A leftover session from an earlier visit blocks a new sign-in: drop it and try once more.
    if ((e as Error).name !== 'UserAlreadyAuthenticatedException') throw e
    await signOut()
    res = await attempt()
  }
  return stepOf(res.nextStep.signInStep)
}

/** Answers the first-login "choose a new password" challenge. */
export async function completeNewPassword(newPassword: string): Promise<SignInStep> {
  const res = await confirmSignIn({ challengeResponse: newPassword })
  return stepOf(res.nextStep.signInStep)
}

function stepOf(step: string): SignInStep {
  if (step === 'DONE') return 'done'
  if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') return 'newPassword'
  if (step === 'RESET_PASSWORD') return 'resetPassword'
  throw new Error(`This account needs a sign-in step the app doesn't support (${step}). Contact IT.`)
}

/** Cognito emails a reset code. Returns the masked address it went to, e.g. "a***@e***". */
export async function requestPasswordReset(email: string): Promise<string | undefined> {
  const res = await resetPassword({ username: email.trim() })
  return res.nextStep.codeDeliveryDetails?.destination
}

export async function confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
  await confirmResetPassword({ username: email.trim(), confirmationCode: code.trim(), newPassword })
}

/** For a signed-in user. */
export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await updatePassword({ oldPassword, newPassword })
}

/** Sign out of Cognito and go back to the portal picker. */
export async function signOutEverywhere(): Promise<void> {
  try {
    await signOut()
  } finally {
    window.location.replace('/')
  }
}

/** The pool's password policy, mirrored so the forms can check it before calling Cognito. */
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
]

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p))

/** Cognito's error, worded for the person at the keyboard. */
export function authErrorMessage(e: unknown): string {
  const err = e as { name?: string; message?: string }
  switch (err?.name) {
    case 'NotAuthorizedException':
      if (/temporary password has expired/i.test(err.message ?? '')) {
        return 'Your temporary password has expired. Ask IT to send you a new one.'
      }
      if (/disabled/i.test(err.message ?? '')) return 'This account is deactivated. Contact IT.'
      if (/incorrect username or password/i.test(err.message ?? '')) return 'Incorrect email or password.'
      return err.message ?? 'Not allowed.'
    case 'UserNotFoundException':
      return 'Incorrect email or password.'
    case 'CodeMismatchException':
      return "That code isn't right. Check the email and try again."
    case 'ExpiredCodeException':
      return 'That code has expired. Ask for a new one.'
    case 'InvalidPasswordException':
      return err.message?.replace(/^Password does not conform to policy: /, '') ?? 'That password is not allowed.'
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Too many attempts. Wait a few minutes and try again.'
    case 'InvalidParameterException':
      if (/no registered\/verified email/i.test(err.message ?? '')) {
        return "This account has no verified email to send a code to. Ask IT to reset your password."
      }
      return err.message ?? 'Something in the form is not valid.'
    default:
      return err?.message || 'Something went wrong. Try again.'
  }
}

export async function fetchMe(): Promise<Me> {
  // Every employee holds EMPLOYEE, so it's always a valid role to ask with. External auditors hold only
  // AUDITOR and get a 403 for it, so ask again as an auditor before giving up.
  let res = await meRequest('EMPLOYEE')
  if (res.status === 403) {
    const asAuditor = await meRequest('AUDITOR')
    if (asAuditor.ok) res = asAuditor
  }
  if (!res.ok) throw await apiError(res)
  const me = (await res.json()) as Omit<Me, 'employeeId' | 'auditorId'> & { employeeId: string | number | null; auditorId?: string | number }
  return {
    ...me,
    employeeId: me.employeeId == null ? '' : String(me.employeeId),
    auditorId: me.auditorId == null ? undefined : String(me.auditorId),
  }
}

async function meRequest(role: Role): Promise<Response> {
  return fetch(`${API_BASE_URL}/me`, { headers: { ...(await authHeaders()), 'X-Active-Role': role } })
}

/** Stand-in user for mock mode: can open every portal. */
export const MOCK_ME: Me = {
  employeeId: 'E1001',
  firstName: 'Alex',
  lastName: 'Morgan',
  availableRoles: ['EMPLOYEE', 'MANAGER', 'PAYROLL_ADMIN', 'IT', 'AUDITOR'],
}
