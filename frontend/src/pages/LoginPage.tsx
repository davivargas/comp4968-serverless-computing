import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PORTALS } from '@/lib/portals'

// PLACEHOLDER: the real sign-in (Cognito) goes here. For now the button just continues to the portal.
export default function LoginPage() {
  const { portalId } = useParams()
  const navigate = useNavigate()
  const portal = PORTALS.find((p) => p.id === portalId)
  if (!portal) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-svh items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">{portal.name} sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Login page placeholder. Authentication isn't connected yet.</p>
        <Button className="mt-6 w-full" onClick={() => navigate(portal.path)}>Continue (mock sign in)</Button>
        <Button asChild variant="ghost" className="mt-2 w-full"><Link to="/">Back</Link></Button>
      </div>
    </div>
  )
}
