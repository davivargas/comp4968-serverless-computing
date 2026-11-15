import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Hub } from 'aws-amplify/utils'
import { useNavigate } from 'react-router-dom'
import { authEnabled, currentIdToken, fetchMe, MOCK_ME, signOutEverywhere, type Me } from '@/lib/auth'
import { SessionContext, type Session } from './session-context'

/** Provides the signed-in user to the whole app. Must sit inside <BrowserRouter>. */
export default function AuthRoot({ children }: { children: ReactNode }) {
  return authEnabled ? <CognitoSession>{children}</CognitoSession> : <MockSession>{children}</MockSession>
}

function MockSession({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const session = useMemo<Session>(
    () => ({ status: 'signedIn', me: MOCK_ME, error: null, refresh: async () => {}, signOut: () => navigate('/') }),
    [navigate],
  )
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

function CognitoSession({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null) // null until the stored session is checked
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const token = await currentIdToken()
    if (!token) {
      setSignedIn(false)
      setMe(null)
      return
    }
    setSignedIn(true)
    try {
      setMe(await fetchMe())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // The refresh token (12 hours) ran out, or another part of the app signed out: back to signed out.
    return Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'tokenRefresh_failure' || payload.event === 'signedOut') {
        setSignedIn(false)
        setMe(null)
      }
    })
  }, [refresh])

  const status: Session['status'] = signedIn === null ? 'loading' : !signedIn ? 'signedOut' : error ? 'error' : me ? 'signedIn' : 'loading'
  const session: Session = { status, me: signedIn ? me : null, error, refresh, signOut: () => void signOutEverywhere() }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
