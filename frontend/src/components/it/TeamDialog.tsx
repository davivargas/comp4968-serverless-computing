import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fullName, type Team, type TeamInput, type User } from '@/lib/it/types'
import { Field } from './UserFormFields'

/** Create (team = null) or edit a team. `managers` are the users with the Manager role. */
export function TeamDialog({
  open, team, managers, onClose, onSubmit,
}: {
  open: boolean
  team: Team | null
  managers: User[]
  onClose: () => void
  onSubmit: (input: TeamInput) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {open && <Form key={team?.teamId ?? 'new'} team={team} managers={managers} onClose={onClose} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ team, managers, onClose, onSubmit }: {
  team: Team | null; managers: User[]; onClose: () => void; onSubmit: (input: TeamInput) => Promise<void>
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [managerId, setManagerId] = useState(team?.managerId ?? '')
  const [busy, setBusy] = useState(false)
  const valid = name.trim() && managerId && (!team || name.trim() !== team.name || managerId !== team.managerId)

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try { await onSubmit({ name: name.trim(), managerId }); onClose() } catch { /* error toast shown by the page */ } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{team ? `Edit ${team.name}` : 'Create team'}</DialogTitle>
        <DialogDescription>A team is a department: the people one manager manages.</DialogDescription>
      </DialogHeader>
      <Field id="t-name" label="Team name"><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Manager" hint="Only users with the Manager role can manage a team.">
        <Select value={managerId} onValueChange={setManagerId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Select a manager" /></SelectTrigger>
          <SelectContent>
            {managers.map((m) => <SelectItem key={m.employeeId} value={m.employeeId}>{fullName(m)} ({m.employeeId})</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : team ? 'Save' : 'Create team'}</Button>
      </DialogFooter>
    </form>
  )
}
