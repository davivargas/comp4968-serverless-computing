import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

// Stand-in for portals built by other teammates.
export default function PortalPlaceholder({ name }: { name: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{name} portal</h1>
      <p className="text-muted-foreground">Not built yet.</p>
      <Button asChild variant="outline"><Link to="/">Sign out</Link></Button>
    </div>
  )
}
