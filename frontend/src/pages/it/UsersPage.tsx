import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmRoleDialog, type PendingRoleChange } from '@/components/it/ConfirmRoleDialog'
import { CreateAccountDialog } from '@/components/it/CreateAccountDialog'
import { EmployeeTable } from '@/components/it/EmployeeTable'
import { ResetCredentialsDialog } from '@/components/it/ResetCredentialsDialog'
import PageHeader from '@/components/PageHeader'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { itApi } from '@/lib/it/api'
import { ROLES, roleLabel, type Employee, type Role } from '@/lib/it/types'
import { useEmployees } from '@/lib/it/useEmployees'

export default function UsersPage() {
  const { employees, loading, run } = useEmployees()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [titleChange, setTitleChange] = useState<{ employee: Employee; title: string } | null>(null)
  const [roleChange, setRoleChange] = useState<PendingRoleChange | null>(null)
  const [resetTarget, setResetTarget] = useState<Employee | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) =>
      (roleFilter === 'all' || e.role === roleFilter) &&
      (statusFilter === 'all' || (statusFilter === 'active') === e.active) &&
      (!q || [e.id, e.name, e.email, e.title, e.managerName ?? '', e.managerId ?? '']
        .some((v) => v.toLowerCase().includes(q))))
  }, [employees, query, roleFilter, statusFilter])

  const actions = {
    onChangeTitle: (employee: Employee, title: string) => setTitleChange({ employee, title }),
    onChangeRole: (employee: Employee, role: Role) => setRoleChange({ employee, role }),
    onResetCredentials: setResetTarget,
    // Deactivating asks for confirmation; reactivating is harmless, so it's immediate.
    onToggleActive: (e: Employee) =>
      e.active
        ? setDeactivateTarget(e)
        : run(() => itApi.setActive(e.id, true), 'Account reactivated').catch(() => {}),
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users" description="View and manage all registered users.">
        <Button onClick={() => setCreateOpen(true)}><Plus /> Create account</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name, ID, email, title or manager"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All access roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <EmployeeTable employees={filtered} loading={loading} actions={actions} />
      </div>

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} employees={employees}
        onSubmit={(input) => run(() => itApi.createAccount(input), 'Account created')} />
      <ConfirmRoleDialog change={roleChange} onClose={() => setRoleChange(null)}
        onConfirm={(c, pw) => run(() => itApi.changeRole(c.employee.id, c.role, pw), `${c.employee.name} is now ${roleLabel(c.role)}`)} />
      <ResetCredentialsDialog employee={resetTarget} onClose={() => setResetTarget(null)}
        onSubmit={(id, input) => run(() => itApi.resetCredentials(id, input), 'Credentials updated')} />

      <AlertDialog open={!!titleChange} onOpenChange={(o) => !o && setTitleChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change job title?</AlertDialogTitle>
            <AlertDialogDescription>
              {titleChange?.employee.name}: {titleChange?.employee.title} → {titleChange?.title}. This doesn't change their access role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const c = titleChange!
              run(() => itApi.changeTitle(c.employee.id, c.title), `${c.employee.name} is now ${c.title}`).catch(() => {})
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be able to sign in. You can reactivate the account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const t = deactivateTarget!
              run(() => itApi.setActive(t.id, false), 'Account deactivated').catch(() => {})
            }}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
