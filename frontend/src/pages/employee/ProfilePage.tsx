import { Landmark, MapPin, Phone } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useEmployeeId } from '@/components/auth/session-context'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { employeeApi } from '@/lib/employee/api'
import { formatPhone, phoneDigits, toStoredPhone, validatePhone } from '@/lib/employee/phone'
import type { Address, EmployeeProfile, ProfileUpdate } from '@/lib/employee/types'

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

type Section = 'phone' | 'address' | 'deposit'

/** Starting values for an employee with no address on file yet. */
const EMPTY_ADDRESS: Address = { street: '', city: '', province: 'BC', postalCode: '', country: 'Canada' }

export default function ProfilePage() {
  const employeeId = useEmployeeId()
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS)
  const [deposit, setDeposit] = useState({ institutionNumber: '', transitNumber: '', accountNumber: '' })
  const [saving, setSaving] = useState<Section | null>(null)

  const reset = (p: EmployeeProfile) => {
    setProfile(p)
    setPhone(formatPhone(p.phone))
    setPhoneTouched(false)
    setAddress(p.address ?? EMPTY_ADDRESS)
    // Account number comes back masked; the field stays blank unless the user enters a new one.
    setDeposit({ institutionNumber: p.directDeposit?.institutionNumber ?? '', transitNumber: p.directDeposit?.transitNumber ?? '', accountNumber: '' })
  }

  useEffect(() => {
    employeeApi.getProfile(employeeId).then(reset).catch((e) => toast.error(`Couldn't load profile: ${e.message}`))
  }, [employeeId])

  async function save(section: Section, update: ProfileUpdate) {
    setSaving(section)
    try {
      reset(await employeeApi.updateProfile(employeeId, update))
      toast.success('Profile updated')
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`)
    } finally {
      setSaving(null)
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const phoneError = validatePhone(phone)
  const phoneChanged = phoneDigits(phone) !== phoneDigits(profile.phone)
  // Only nag once they've left the field (or tried to save), not on every keystroke.
  const showPhoneError = phoneTouched && phoneChanged && !!phoneError
  const postalValid = address.country !== 'Canada' || /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(address.postalCode)
  const addressValid = address.street.trim() && address.city.trim() && postalValid
  const savedDeposit = profile.directDeposit
  const depositErrors = [
    !/^\d{3}$/.test(deposit.institutionNumber) && 'Institution number must be 3 digits.',
    !/^\d{5}$/.test(deposit.transitNumber) && 'Transit number must be 5 digits.',
    // With no account on file yet, the account number is required; otherwise blank keeps the current one.
    (deposit.accountNumber || !savedDeposit) && !/^\d{7,12}$/.test(deposit.accountNumber) && 'Account number must be 7–12 digits.',
  ].filter(Boolean) as string[]
  const depositChanged =
    deposit.accountNumber !== '' ||
    deposit.institutionNumber !== (savedDeposit?.institutionNumber ?? '') ||
    deposit.transitNumber !== (savedDeposit?.transitNumber ?? '')

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="My profile" description="Keep your contact and banking details up to date." />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Info label="Name" value={`${profile.firstName} ${profile.lastName}`} />
          <Info label="Employee ID" value={String(profile.employeeId)} />
          <Info label="Position" value={profile.position} />
          <Info label="Pay grade" value={profile.payGrade} />
        </CardContent>
      </Card>

      <SectionCard
        icon={<Phone />}
        title="Phone number"
        onSave={() => (phoneError ? setPhoneTouched(true) : save('phone', { phone: toStoredPhone(phone) }))}
        saving={saving === 'phone'}
        canSave={phoneChanged && !phoneError}
        onCancel={() => {
          setPhone(formatPhone(profile.phone))
          setPhoneTouched(false)
        }}
      >
        <Field label="Phone" id="phone">
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(604) 555-0142"
            maxLength={20}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              setPhoneTouched(true)
              if (!validatePhone(phone)) setPhone(formatPhone(phone))
            }}
            aria-invalid={showPhoneError}
            aria-describedby="phone-help"
          />
        </Field>
        <p id="phone-help" className={showPhoneError ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
          {showPhoneError ? phoneError : 'Canadian or US number, 10 digits. For example (604) 555-0142.'}
        </p>
      </SectionCard>

      <SectionCard
        icon={<MapPin />}
        title="Home address"
        onSave={() => save('address', { address })}
        saving={saving === 'address'}
        canSave={!!addressValid && JSON.stringify(address) !== JSON.stringify(profile.address ?? EMPTY_ADDRESS)}
        onCancel={() => setAddress(profile.address ?? EMPTY_ADDRESS)}
      >
        <Field label="Street" id="street">
          <Input id="street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" id="city">
            <Input id="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          </Field>
          <Field label="Province" id="province">
            <Select value={address.province} onValueChange={(province) => setAddress({ ...address, province })}>
              <SelectTrigger id="province" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Postal code" id="postal">
            <Input id="postal" value={address.postalCode} aria-invalid={!postalValid}
              onChange={(e) => setAddress({ ...address, postalCode: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Country" id="country">
            <Input id="country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} />
          </Field>
        </div>
        {!postalValid && <p className="text-sm text-destructive">Enter a valid Canadian postal code (e.g. V5G 3H2).</p>}
      </SectionCard>

      <SectionCard
        icon={<Landmark />}
        title="Direct deposit"
        description={savedDeposit ? `Pay is currently deposited to account ${savedDeposit.accountNumber}.` : 'No direct deposit account on file yet. Add one to get paid by deposit.'}
        onSave={() =>
          save('deposit', {
            directDeposit: {
              institutionNumber: deposit.institutionNumber,
              transitNumber: deposit.transitNumber,
              ...(deposit.accountNumber ? { accountNumber: deposit.accountNumber } : {}),
            },
          })
        }
        saving={saving === 'deposit'}
        canSave={depositErrors.length === 0 && depositChanged}
        onCancel={() => reset(profile)}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Institution #" id="inst">
            <Input id="inst" inputMode="numeric" maxLength={3} value={deposit.institutionNumber}
              onChange={(e) => setDeposit({ ...deposit, institutionNumber: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Transit #" id="transit">
            <Input id="transit" inputMode="numeric" maxLength={5} value={deposit.transitNumber}
              onChange={(e) => setDeposit({ ...deposit, transitNumber: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Account #" id="account">
            <Input id="account" inputMode="numeric" maxLength={12} autoComplete="off" placeholder={savedDeposit?.accountNumber ?? '7–12 digits'}
              value={deposit.accountNumber} onChange={(e) => setDeposit({ ...deposit, accountNumber: e.target.value.replace(/\D/g, '') })} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">Leave the account number blank to keep the current one. Changes apply from the next pay date.</p>
        {depositErrors.map((e) => <p key={e} className="text-sm text-destructive">{e}</p>)}
      </SectionCard>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function SectionCard({
  icon, title, description, children, onSave, onCancel, saving, canSave,
}: {
  icon: ReactNode
  title: string
  description?: string
  children: ReactNode
  onSave: () => void
  onCancel: () => void
  saving: boolean
  canSave: boolean
}) {
  return (
    <Card>
      <form onSubmit={(e) => { e.preventDefault(); if (canSave) onSave() }} className="contents">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base [&_svg]:size-4 [&_svg]:text-muted-foreground">{icon}{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={!canSave || saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </CardFooter>
      </form>
    </Card>
  )
}
