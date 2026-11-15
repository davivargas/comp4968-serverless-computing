import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Address, Position, Team } from '@/lib/it/types'

export const NO_TEAM = 'none'

// The backend takes two-letter codes: country CA or US, province/state like BC.
export const emptyAddress: Address = { street: '', city: '', province: '', postalCode: '', country: 'CA' }
const countryCode = (c: string) => (/^us|united states/i.test(c) ? 'US' : 'CA')
/** What the backend accepts: two-letter country, uppercase province and postal code, no stray spaces. */
export const normalizeAddress = (a: Address): Address => ({
  street: a.street.trim(), city: a.city.trim(), province: a.province.trim().toUpperCase(),
  postalCode: a.postalCode.trim().toUpperCase(), country: countryCode(a.country),
})
export const addressFilled = (a: Address) => Object.values(a).some((v) => v.trim() !== '')
export const addressComplete = (a: Address) => Object.values(a).every((v) => v.trim() !== '')
/**
 * Turns how people type a Canadian/US number ("604 555 0142", "(604) 555-0142", "16045550142")
 * into the E.164 form the backend stores (+16045550142). Anything else is returned trimmed, so it fails phoneValid.
 */
export function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return p.trim()
}
// Same rule as the backend: +1, then an area code and exchange that don't start with 0 or 1.
export const phoneValid = (p: string) => /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(normalizePhone(p))

export function Field({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    // min-w-0 lets long select values (team names) truncate instead of spilling into the next column.
    <div className="grid min-w-0 gap-2">
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
        <SelectItem value={NO_TEAM}><span className="truncate">No team (topmost person)</span></SelectItem>
        {teams.map((t) => <SelectItem key={t.teamId} value={String(t.teamId)}><span className="truncate">{t.name} · {t.managerName}</span></SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const set = (k: keyof Address, upper = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: upper ? e.target.value.toUpperCase() : e.target.value })
  // Older records or the mock may hold a full country name; show it as its code.
  const country = countryCode(value.country)
  return (
    <div className="grid gap-3">
      <Input placeholder="Street" aria-label="Street" value={value.street} onChange={set('street')} />
      <div className="grid grid-cols-2 gap-3">
        <Input placeholder="City" aria-label="City" value={value.city} onChange={set('city')} />
        <Input placeholder={country === 'US' ? 'State (e.g. WA)' : 'Province (e.g. BC)'} aria-label="Province or state" maxLength={2}
          value={value.province} onChange={set('province', true)} />
        <Input placeholder={country === 'US' ? 'ZIP code' : 'Postal code'} aria-label="Postal code" value={value.postalCode} onChange={set('postalCode', true)} />
        <Select value={country} onValueChange={(c) => onChange({ ...value, country: c })}>
          <SelectTrigger className="w-full" aria-label="Country"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CA">Canada</SelectItem>
            <SelectItem value="US">United States</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
