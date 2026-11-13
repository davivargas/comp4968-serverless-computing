import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fullName, type Position, type Team, type UpdateUserInput, type User } from '@/lib/it/types'
import {
  AddressFields, Field, NO_TEAM, PositionSelect, TeamSelect, addressComplete, addressFilled, emptyAddress, phoneValid,
} from './UserFormFields'

export function EditUserDialog({
  user, positions, teams, onClose, onSave, onResetPassword,
}: {
  user: User | null
  positions: Position[]
  teams: Team[]
  onClose: () => void
  onSave: (id: string, input: UpdateUserInput) => Promise<void>
  onResetPassword: (u: User) => Promise<void>
}) {
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        {user && <Form key={user.employeeId} user={user} positions={positions} teams={teams} onClose={onClose} onSave={onSave} onResetPassword={onResetPassword} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ user, positions, teams, onClose, onSave, onResetPassword }: {
  user: User; positions: Position[]; teams: Team[]; onClose: () => void
  onSave: (id: string, input: UpdateUserInput) => Promise<void>
  onResetPassword: (u: User) => Promise<void>
}) {
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [positionId, setPositionId] = useState(String(user.positionId))
  const [teamId, setTeamId] = useState(user.teamId === null ? NO_TEAM : String(user.teamId))
  const [address, setAddress] = useState(user.address ?? emptyAddress)
  const [busy, setBusy] = useState(false)

  const phoneOk = phone === '' || phoneValid(phone)
  const addressOk = !addressFilled({ ...address, country: '' }) || addressComplete(address)

  // Only send what changed.
  const changes: UpdateUserInput = {}
  if (firstName.trim() !== user.firstName) changes.firstName = firstName.trim()
  if (lastName.trim() !== user.lastName) changes.lastName = lastName.trim()
  if (email.trim() !== user.email) changes.email = email.trim()
  if (phone !== (user.phone ?? '')) changes.phone = phone || null
  if (Number(positionId) !== user.positionId) changes.positionId = Number(positionId)
  const newTeam = teamId === NO_TEAM ? null : Number(teamId)
  if (newTeam !== user.teamId) changes.teamId = newTeam
  if (JSON.stringify(address) !== JSON.stringify(user.address ?? emptyAddress) && addressFilled({ ...address, country: '' })) changes.address = address

  const valid = Object.keys(changes).length > 0 && firstName.trim() && lastName.trim() && /^\S+@\S+\.\S+$/.test(email) && phoneOk && addressOk

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try { await onSave(user.employeeId, changes); onClose() } catch { /* error toast shown by the page */ } finally { setBusy(false) }
  }

  const reset = async () => {
    setBusy(true)
    try { await onResetPassword(user) } catch { /* error toast shown by the page */ } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Edit {fullName(user)}</DialogTitle>
        <DialogDescription>{user.employeeId} · hired {user.hireDate}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field id="e-first" label="First name"><Input id="e-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
        <Field id="e-last" label="Last name"><Input id="e-last" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
      </div>
      <Field id="e-email" label="Email" hint="Changing this also changes their sign-in email.">
        <Input id="e-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="e-phone" label="Phone" hint={phoneOk ? 'Format: +16045550142. Clear to remove.' : 'Use +1 followed by 10 digits'}>
        <Input id="e-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Position"><PositionSelect positions={positions} value={positionId} onChange={setPositionId} /></Field>
      <Field label="Team"><TeamSelect teams={teams} value={teamId} onChange={setTeamId} /></Field>
      <Field label="Address" hint={addressOk ? undefined : 'Fill in every address field'}>
        <AddressFields value={address} onChange={setAddress} />
      </Field>
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="text-sm">
          <div className="font-medium">Password</div>
          <div className="text-xs text-muted-foreground">Emails {user.firstName} a reset code.</div>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy || user.status === 'DEACTIVATED'} onClick={reset}>Send reset email</Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </DialogFooter>
    </form>
  )
}
