import { Landmark, MapPin, Phone } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { employeeApi } from '@/lib/employee/api'
import { CURRENT_EMPLOYEE_ID } from '@/lib/employee/session'
import type { Address, EmployeeProfile, ProfileUpdate } from '@/lib/employee/types'

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']

type Section = 'phone' | 'address' | 'deposit'

export default function ProfilePage() {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState<Address | null>(null)
  const [deposit, setDeposit] = useState({ institutionNumber: '', transitNumber: '', accountNumber: '' })
  const [saving, setSaving] = useState<Section | null>(null)

  const reset = (p: EmployeeProfile) => {
    setProfile(p)
    setPhone(p.phone)
    setAddress(p.address)
    // Account number comes back masked; the field stays blank unless the user enters a new one.
    setDeposit({ institutionNumber: p.directDeposit.institutionNumber, transitNumber: p.directDeposit.transitNumber, accountNumber: '' })
  }

  useEffect(() => {
    employeeApi.getProfile(CURRENT_EMPLOYEE_ID).then(reset).catch((e) => toast.error(`Couldn't load profile: ${e.message}`))
  }, [])

  async function save(section: Section, update: ProfileUpdate) {
    setSaving(section)
    try {
      reset(await employeeApi.updateProfile(CURRENT_EMPLOYEE_ID, update))
      toast.success('Profile updated')
    } catch (e) {
      toast.error(`Update failed: ${(e as Error).message}`)
    } finally {
      setSaving(null)
    }
  }

  if (!profile || !address) {
    return (
      <div className="mx-auto grid max-w-3xl gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  const phoneValid = /^\+?[\d\s().-]{10,}$/.test(phone)
  const postalValid = address.country !== 'Canada' || /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(address.postalCode)
  const addressValid = address.street.trim() && address.city.trim() && postalValid
  const depositErrors = [
    !/^\d{3}$/.test(deposit.institutionNumber) && 'Institution number must be 3 digits.',
    !/^\d{5}$/.test(deposit.transitNumber) && 'Transit number must be 5 digits.',
    deposit.accountNumber && !/^\d{7,12}$/.test(deposit.accountNumber) && 'Account number must be 7–12 digits.',
  ].filter(Boolean) as string[]
  const depositChanged =
    deposit.accountNumber !== '' ||
    deposit.institutionNumber !== profile.directDeposit.institutionNumber ||
    deposit.transitNumber !== profile.directDeposit.transitNumber

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="My profile" description="Keep your contact and banking details up to date." />

      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Info label="Name" value={`${profile.firstName} ${profile.lastName}`} />
          <Info label="Employee ID" value={profile.employeeId} />
          <Info label="Position" value={profile.position} />
          <Info label="Pay grade" value={profile.payGrade} />
        </CardContent>
      </Card>

      <SectionCard
        icon={<Phone />}
        title="Phone number"
        onSave={() => save('phone', { phone })}
        saving={saving === 'phone'}
        canSave={phoneValid && phone !== profile.phone}
        onCancel={() => setPhone(profile.phone)}
      >
        <Field label="Phone" id="phone">
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!phoneValid} />
        </Field>
        {!phoneValid && <p className="text-sm text-destructive">Enter a valid phone number.</p>}
      </SectionCard>

      <SectionCard
        icon={<MapPin />}
        title="Home address"
        onSave={() => save('address', { address })}
        saving={saving === 'address'}
        canSave={!!addressValid && JSON.stringify(address) !== JSON.stringify(profile.address)}
        onCancel={() => setAddress(profile.address)}
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
        description={`Pay is currently deposited to account ${profile.directDeposit.accountNumber}.`}
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
            <Input id="account" inputMode="numeric" maxLength={12} autoComplete="off" placeholder={profile.directDeposit.accountNumber}
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
