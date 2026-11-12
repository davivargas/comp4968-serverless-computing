import { createContext, useContext } from 'react'
import type { Me } from '@/lib/auth'

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn' | 'error'

export interface Session {
  status: SessionStatus
  me: Me | null
  error: string | null
  /** Send the user to sign in, then bring them back to `returnTo`. */
  signIn(returnTo: string): void
  signOut(): void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside <AuthRoot>')
  return session
}

/** The signed-in employee's ID. Only call it under <RequireRole>, where `me` is always loaded. */
export function useEmployeeId(): string {
  const { me } = useSession()
  if (!me) throw new Error('useEmployeeId called before the user was loaded')
  return me.employeeId
}
