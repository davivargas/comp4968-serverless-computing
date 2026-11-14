import { useState } from 'react'
import { Check, Circle, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_RULES } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** A password input with a show/hide toggle. */
export function PasswordInput({ id, label, value, onChange, autoComplete, autoFocus }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'; autoFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} autoFocus={autoFocus} required className="pr-10" />
        <button type="button" onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  )
}

/** The pool's password rules, ticking off as the user types. */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="grid gap-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password)
        return (
          <li key={r.label} className={cn('flex items-center gap-1.5', ok ? 'text-primary' : 'text-muted-foreground')}>
            {ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
            {r.label}
          </li>
        )
      })}
    </ul>
  )
}
