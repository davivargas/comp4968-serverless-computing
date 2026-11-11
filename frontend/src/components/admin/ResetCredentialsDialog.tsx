import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Employee, ResetCredentialsInput } from '@/lib/types'

export function ResetCredentialsDialog({
  employee, onClose, onSubmit,
}: {
  employee: Employee | null
  onClose: () => void
  onSubmit: (id: string, input: ResetCredentialsInput) => Promise<void>
}) {
  return (
    <Dialog open={!!employee} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {employee && <Body key={employee.id} employee={employee} onClose={onClose} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ employee, onClose, onSubmit }: {
  employee: Employee; onClose: () => void
  onSubmit: (id: string, input: ResetCredentialsInput) => Promise<void>
}) {
  const [email, setEmail] = useState(employee.email)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const emailChanged = email.trim() !== employee.email
  const emailOk = !emailChanged || /^\S+@\S+\.\S+$/.test(email.trim())
  const pwOk = password === '' || password.length >= 8
  const canSave = (emailChanged || password !== '') && emailOk && pwOk

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try {
      await onSubmit(employee.id, {
        email: emailChanged ? email.trim() : undefined,
        password: password || undefined,
      })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Reset email / password</DialogTitle>
        <DialogDescription>{employee.name} ({employee.id}). Change one or both.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="r-email">Email</Label>
        <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="r-pw">New password</Label>
        <Input id="r-pw" type="password" autoComplete="new-password" placeholder="Leave blank to keep unchanged"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!canSave || busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </form>
  )
}
