import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ModeToggle } from '@/components/mode-toggle'
import { PORTALS } from '@/lib/portals'

export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-8">
        <div className="font-semibold">Timesheet Pro</div>
        <ModeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">Sign in to your portal</h1>
        <p className="mt-2 text-muted-foreground">Choose the portal that matches your role.</p>
        <div className="mt-10 grid auto-rows-fr gap-5 sm:grid-cols-2">
          {PORTALS.map((p) => (
            <Link key={p.id} to={`/login/${p.id}`}
              className="group flex min-h-48 flex-col justify-between rounded-xl border bg-card p-7 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <div>
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                Sign in
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
