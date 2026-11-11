import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { roleLabel, type Employee, type Role } from '@/lib/types'

export interface PendingRoleChange { employee: Employee; role: Role }

// Granting or removing IT Admin needs the acting admin to re-enter their password.
export const needsPassword = (c: PendingRoleChange) =>
  c.role === 'IT_ADMIN' || c.employee.role === 'IT_ADMIN'

export function ConfirmRoleDialog({
  change, onClose, onConfirm,
}: {
  change: PendingRoleChange | null
  onClose: () => void
  onConfirm: (c: PendingRoleChange, adminPassword?: string) => Promise<void>
}) {
  return (
    <Dialog open={!!change} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {change && <Body key={change.employee.id + change.role} change={change} onClose={onClose} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}

function Body({ change, onClose, onConfirm }: {
  change: PendingRoleChange; onClose: () => void
  onConfirm: (c: PendingRoleChange, adminPassword?: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const secure = needsPassword(change)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try { await onConfirm(change, secure ? password : undefined); onClose() } catch { /* toast shown by caller */ } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Change role?</DialogTitle>
        <DialogDescription>
          Change {change.employee.name} ({change.employee.id}) from{' '}
          <b>{roleLabel(change.employee.role)}</b> to <b>{roleLabel(change.role)}</b>.
        </DialogDescription>
      </DialogHeader>
      {secure && (
        <div className="grid gap-2">
          <Label htmlFor="admin-pw">Your IT password</Label>
          <Input id="admin-pw" type="password" autoComplete="current-password" autoFocus
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-xs text-muted-foreground">Required when granting or removing IT Admin access.</p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || (secure && !password)}>{busy ? 'Saving…' : 'Confirm'}</Button>
      </DialogFooter>
    </form>
  )
}
