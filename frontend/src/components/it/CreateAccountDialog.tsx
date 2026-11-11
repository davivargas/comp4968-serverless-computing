import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { TITLE_GROUPS, DEFAULT_TITLE } from '@/lib/it/titles'
import { ROLES, type CreateAccountInput, type Employee, type Role } from '@/lib/it/types'

const NO_MANAGER = 'none'

export function CreateAccountDialog({
  open, onOpenChange, employees, onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  employees: Employee[]
  onSubmit: (input: CreateAccountInput) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [role, setRole] = useState<Role>('EMPLOYEE')
  const [managerId, setManagerId] = useState(NO_MANAGER)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const managers = employees.filter((e) => e.active && e.role === 'MANAGER')
  const valid = name.trim() && /^\S+@\S+\.\S+$/.test(email) && password.length >= 8

  const reset = () => {
    setName(''); setEmail(''); setTitle(DEFAULT_TITLE); setRole('EMPLOYEE'); setManagerId(NO_MANAGER); setPassword('')
  }

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(), email: email.trim(), title, role,
        managerId: managerId === NO_MANAGER ? null : managerId,
        temporaryPassword: password,
      })
      reset()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create account</DialogTitle>
            <DialogDescription>Add a new employee account.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="c-name">Full name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Job title</Label>
            <Select value={title} onValueChange={setTitle}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TITLE_GROUPS.map((g) => (
                  <SelectGroup key={g.track}>
                    <SelectLabel>{g.track}</SelectLabel>
                    {g.titles.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Access role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANAGER}>No manager</SelectItem>
                  {managers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-pw">Temporary password</Label>
            <Input id="c-pw" type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || busy}>{busy ? 'Creating…' : 'Create account'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
