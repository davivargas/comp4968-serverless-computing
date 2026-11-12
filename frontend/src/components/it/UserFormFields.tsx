import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Address, Position, Team } from '@/lib/it/types'

export const NO_TEAM = 'none'

export const emptyAddress: Address = { street: '', city: '', province: '', postalCode: '', country: 'Canada' }
export const addressFilled = (a: Address) => Object.values(a).some((v) => v.trim() !== '')
export const addressComplete = (a: Address) => Object.values(a).every((v) => v.trim() !== '')
// E.164 for Canadian/US numbers, e.g. +16045550142
export const phoneValid = (p: string) => /^\+1\d{10}$/.test(p)

export function Field({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function PositionSelect({ positions, value, onChange }: { positions: Position[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Select a position" /></SelectTrigger>
      <SelectContent>
        {positions.map((p) => <SelectItem key={p.positionId} value={String(p.positionId)}>{p.title} ({p.payGrade})</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function TeamSelect({ teams, value, onChange }: { teams: Team[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TEAM}>No team (topmost person)</SelectItem>
        {teams.map((t) => <SelectItem key={t.teamId} value={String(t.teamId)}>{t.name} · {t.managerName}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-3">
      <Input placeholder="Street" aria-label="Street" value={value.street} onChange={set('street')} />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="City" aria-label="City" value={value.city} onChange={set('city')} />
        <Input placeholder="Province" aria-label="Province" value={value.province} onChange={set('province')} />
        <Input placeholder="Postal code" aria-label="Postal code" value={value.postalCode} onChange={set('postalCode')} />
        <Input placeholder="Country" aria-label="Country" value={value.country} onChange={set('country')} />
      </div>
    </div>
  )
}
