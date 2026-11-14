import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import FullScreenMessage from '@/components/auth/FullScreenMessage'
import { PasswordInput, PasswordRules } from '@/components/auth/PasswordFields'
import { useSession } from '@/components/auth/session-context'
import Mascot from '@/components/Mascot'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  authErrorMessage, completeNewPassword, confirmPasswordReset, passwordOk, requestPasswordReset, signInWithPassword,
  type SignInStep,
} from '@/lib/auth'
import { APP_NAME } from '@/lib/brand'
import { PORTALS } from '@/lib/portals'

type Step = 'signIn' | 'newPassword' | 'forgot' | 'reset'

/**
 * Picking a portal tile lands here. Signed in: go straight to the portal (its guard checks the role).
 * Signed out: the sign-in form, which also covers the first-login new password and forgot password.
 */
export default function LoginPage() {
  const { portalId } = useParams()
  const { status, error, refresh, signOut } = useSession()
  const portal = PORTALS.find((p) => p.id === portalId)

  if (!portal) return <Navigate to="/" replace />
  if (status === 'signedIn') return <Navigate to={portal.path} replace />
  if (status === 'loading') return <FullScreenMessage title="Loading your account…" loading />
  if (status === 'error') {
    return (
      <FullScreenMessage title="We couldn't load your account">
        <p>{error ?? 'Unknown error.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => void refresh()}>Try again</Button>
          <Button variant="ghost" onClick={signOut}>Sign out</Button>
        </div>
      </FullScreenMessage>
    )
  }
  return <SignInFlow portalName={portal.name} onSignedIn={refresh} />
}

function SignInFlow({ portalName, onSignedIn }: { portalName: string; onSignedIn: () => Promise<void> }) {
  const [step, setStep] = useState<Step>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [codeSentTo, setCodeSentTo] = useState<string>()
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const go = (next: Step) => {
    setStep(next)
    setError(null)
    setNewPassword('')
    setConfirm('')
  }

  /** Runs a Cognito call with the busy state and a friendly error. */
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const run = (fn: () => Promise<void>) => (ev: FormEvent) => {
    ev.preventDefault()
    void act(fn)
  }

  const after = async (next: SignInStep) => {
    if (next === 'done') return onSignedIn()
    if (next === 'newPassword') return go('newPassword')
    // An admin reset this account's password: Cognito wants a code, so send one.
    setCodeSentTo(await requestPasswordReset(email))
    setNotice('Your password was reset. We emailed you a code to choose a new one.')
    go('reset')
  }

  const newPasswordReady = passwordOk(newPassword) && newPassword === confirm
  const mismatch = confirm !== '' && newPassword !== confirm

  const newPasswordFields = (
    <>
      <PasswordInput id="new-password" label="New password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" autoFocus={step === 'newPassword'} />
      <PasswordRules password={newPassword} />
      <PasswordInput id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      {mismatch && <p className="text-xs text-destructive">The passwords don't match.</p>}
    </>
  )

  return (
    <AuthCard>
      {step === 'signIn' && (
        <form onSubmit={run(async () => after(await signInWithPassword(email, password)))} className="grid gap-4">
          <Heading title={`Sign in to the ${portalName} portal`} />
          {notice && <Notice>{notice}</Notice>}
          <EmailField value={email} onChange={setEmail} autoFocus />
          <PasswordInput id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <div className="flex items-center justify-between text-sm">
            <Link to="/" className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />All portals</Link>
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setNotice(null); go('forgot') }}>Forgot password?</button>
          </div>
        </form>
      )}

      {step === 'newPassword' && (
        <form onSubmit={run(async () => after(await completeNewPassword(newPassword)))} className="grid gap-4">
          <Heading title="Choose a new password" text="You signed in with a temporary password. Pick your own to finish setting up your account." />
          {newPasswordFields}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !newPasswordReady}>{busy ? 'Saving…' : 'Set password and continue'}</Button>
          <BackLink onClick={() => { setPassword(''); go('signIn') }} />
        </form>
      )}

      {step === 'forgot' && (
        <form onSubmit={run(async () => { setCodeSentTo(await requestPasswordReset(email)); setCode(''); go('reset') })} className="grid gap-4">
          <Heading title="Reset your password" text="Enter your work email and we'll send you a code." />
          <EmailField value={email} onChange={setEmail} autoFocus />
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !email}>{busy ? 'Sending…' : 'Send code'}</Button>
          <BackLink onClick={() => go('signIn')} />
        </form>
      )}

      {step === 'reset' && (
        <form
          onSubmit={run(async () => {
            await confirmPasswordReset(email, code, newPassword)
            setPassword('')
            setNotice('Password changed. Sign in with your new password.')
            go('signIn')
          })}
          className="grid gap-4"
        >
          <Heading title="Enter your code" text={`We emailed a code to ${codeSentTo ?? email}. It can take a minute to arrive.`} />
          {notice && <Notice>{notice}</Notice>}
          <div className="grid gap-2">
            <Label htmlFor="code">Code</Label>
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </div>
          {newPasswordFields}
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !code.trim() || !newPasswordReady}>{busy ? 'Saving…' : 'Change password'}</Button>
          <div className="flex items-center justify-between text-sm">
            <BackLink onClick={() => { setNotice(null); go('signIn') }} />
            <button type="button" className="font-medium text-primary hover:underline" disabled={busy}
              onClick={() => void act(async () => { setCodeSentTo(await requestPasswordReset(email)); setNotice('We sent a new code.') })}>
              Send a new code
            </button>
          </div>
        </form>
      )}
    </AuthCard>
  )
}

function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-8">
        <Link to="/" className="flex items-center gap-2 font-semibold"><Mascot className="size-9" mode="idle" label="" />{APP_NAME}</Link>
        <ModeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xs sm:p-8">{children}</div>
      </main>
    </div>
  )
}

function Heading({ title, text }: { title: string; text?: string }) {
  return (
    <div className="mb-1">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {text && <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

function EmailField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" autoComplete="username" value={value} onChange={(e) => onChange(e.target.value)} required autoFocus={autoFocus} />
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{children}</p>
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 justify-self-start text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" />Back to sign in
    </button>
  )
}
