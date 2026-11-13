import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROLES, type CreateAccountInput, type Position, type Role, type Team } from '@/lib/it/types'
import {
  AddressFields, Field, NO_TEAM, PositionSelect, TeamSelect, addressComplete, addressFilled, emptyAddress, phoneValid,
} from './UserFormFields'

export function CreateAccountDialog({
  open, onOpenChange, positions, teams, onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  positions: Position[]
  teams: Team[]
  onSubmit: (input: CreateAccountInput) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        {/* Remounts on open so the form always starts empty */}
        {open && <Form positions={positions} teams={teams} onClose={() => onOpenChange(false)} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ positions, teams, onClose, onSubmit }: {
  positions: Position[]; teams: Team[]; onClose: () => void; onSubmit: (input: CreateAccountInput) => Promise<void>
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [positionId, setPositionId] = useState('')
  const [teamId, setTeamId] = useState(NO_TEAM)
  const [role, setRole] = useState<Role>('EMPLOYEE')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState(emptyAddress)
  const [busy, setBusy] = useState(false)

  const phoneOk = phone === '' || phoneValid(phone)
  const addressOk = !addressFilled({ ...address, country: '' }) || addressComplete(address)
  const valid = firstName.trim() && lastName.trim() && /^\S+@\S+\.\S+$/.test(email) && hireDate && positionId && phoneOk && addressOk

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setBusy(true)
    try {
      await onSubmit({
        firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), hireDate,
        positionId: Number(positionId), role,
        ...(teamId !== NO_TEAM && { teamId: Number(teamId) }),
        ...(phone && { phone }),
        ...(addressFilled({ ...address, country: '' }) && { address }),
      })
      onClose()
    } catch { /* the page shows the error toast; keep the form open */ } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Create account</DialogTitle>
        <DialogDescription>They'll get an email invite to set their password.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field id="c-first" label="First name"><Input id="c-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
        <Field id="c-last" label="Last name"><Input id="c-last" value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
      </div>
      <Field id="c-email" label="Email"><Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="c-hire" label="Hire date"><Input id="c-hire" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></Field>
        <Field id="c-phone" label="Phone (optional)" hint={phoneOk ? 'Format: +16045550142' : 'Use +1 followed by 10 digits'}>
          <Input id="c-phone" type="tel" placeholder="+16045550142" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="Position"><PositionSelect positions={positions} value={positionId} onChange={setPositionId} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Team"><TeamSelect teams={teams} value={teamId} onChange={setTeamId} /></Field>
        <Field label="Access role">
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Address (optional)" hint={addressOk ? undefined : 'Fill in every address field, or leave them all empty'}>
        <AddressFields value={address} onChange={setAddress} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!valid || busy}>{busy ? 'Creating…' : 'Create account'}</Button>
      </DialogFooter>
    </form>
  )
}
