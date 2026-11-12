import type { ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Role } from '@/lib/auth'
import FullScreenMessage from './FullScreenMessage'
import { useSession } from './session-context'

/** Guards a portal: signed in, `/me` loaded, and the user holds the portal's role. */
export default function RequireRole({ role, portalId, portalName, children }: { role: Role; portalId: string; portalName: string; children: ReactNode }) {
  const { status, me, error, signOut } = useSession()

  if (status === 'loading') return <FullScreenMessage title="Loading your account…" loading />
  if (status === 'signedOut') return <Navigate to={`/login/${portalId}`} replace />
  if (status === 'error' || !me) {
    return (
      <FullScreenMessage title="We couldn't load your account">
        <p>{error ?? 'Unknown error.'}</p>
        <Button className="mt-4" variant="outline" onClick={signOut}>Sign out</Button>
      </FullScreenMessage>
    )
  }
  if (!me.availableRoles.includes(role)) {
    return (
      <FullScreenMessage title={`You don't have access to the ${portalName} portal`}>
        <p>Your account can open: {me.availableRoles.map((r) => r.replace('_', ' ').toLowerCase()).join(', ')}.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button asChild variant="outline"><Link to="/">Choose another portal</Link></Button>
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </FullScreenMessage>
    )
  }
  return <>{children}</>
}
