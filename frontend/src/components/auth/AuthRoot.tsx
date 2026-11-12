import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthProvider, hasAuthParams, useAuth } from 'react-oidc-context'
import { useNavigate } from 'react-router-dom'
import { authEnabled, fetchMe, MOCK_ME, oidcConfig, signOutEverywhere, type Me } from '@/lib/auth'
import FullScreenMessage from './FullScreenMessage'
import { SessionContext, type Session } from './session-context'

/** Provides the signed-in user to the whole app. Must sit inside <BrowserRouter>. */
export default function AuthRoot({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  if (!authEnabled) return <MockSession>{children}</MockSession>
  return (
    <AuthProvider
      {...oidcConfig}
      // Cognito sends the user back to "/?code=…"; continue to the portal they picked and drop the code from the URL.
      onSigninCallback={(user) => navigate((user?.state as { returnTo?: string } | undefined)?.returnTo ?? '/', { replace: true })}
    >
      <CognitoSession>{children}</CognitoSession>
    </AuthProvider>
  )
}

function MockSession({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const session = useMemo<Session>(
    () => ({ status: 'signedIn', me: MOCK_ME, error: null, signIn: (to) => navigate(to), signOut: () => navigate('/') }),
    [navigate],
  )
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

function CognitoSession({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const signedIn = auth.isAuthenticated
  const userId = auth.user?.profile.sub

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    fetchMe()
      .then((m) => !cancelled && (setMe(m), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [signedIn, userId])

  const status: Session['status'] = auth.isLoading
    ? 'loading'
    : !signedIn
      ? 'signedOut'
      : error
        ? 'error'
        : me
          ? 'signedIn'
          : 'loading'

  const session: Session = {
    status,
    me: signedIn ? me : null,
    error: auth.error?.message ?? error,
    signIn: (returnTo) => void auth.signinRedirect({ state: { returnTo } }),
    signOut: signOutEverywhere,
  }

  // While Cognito's code is being exchanged for tokens, don't flash the landing page.
  if (auth.isLoading && hasAuthParams()) return <FullScreenMessage title="Signing you in…" loading />

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
