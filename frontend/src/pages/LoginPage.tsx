import { useEffect, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import FullScreenMessage from '@/components/auth/FullScreenMessage'
import { useSession } from '@/components/auth/session-context'
import { Button } from '@/components/ui/button'
import { APP_NAME } from '@/lib/brand'
import { PORTALS } from '@/lib/portals'

/**
 * Picking a portal tile lands here. Signed in: go straight to the portal (its guard checks the role).
 * Signed out: go straight to the Cognito sign-in page, with no extra button to click.
 */
export default function LoginPage() {
  const { portalId } = useParams()
  const { status, error, signIn } = useSession()
  const portal = PORTALS.find((p) => p.id === portalId)
  const started = useRef(false)

  useEffect(() => {
    if (!portal || status !== 'signedOut' || started.current) return
    started.current = true // StrictMode runs effects twice in dev; redirect once
    signIn(portal.path)
  }, [portal, status, signIn])

  if (!portal) return <Navigate to="/" replace />
  if (status === 'signedIn') return <Navigate to={portal.path} replace />
  if (status === 'error') {
    return (
      <FullScreenMessage title="Sign-in didn't work">
        <p>{error ?? 'Unknown error.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => signIn(portal.path)}>Try again</Button>
          <Button asChild variant="ghost"><Link to="/">Back</Link></Button>
        </div>
      </FullScreenMessage>
    )
  }
  return <FullScreenMessage title={`Taking you to ${APP_NAME} sign-in…`} loading />
}
