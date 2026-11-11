import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, Search, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AdminShell, type View } from '@/components/layout/AdminShell'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { StatCards } from '@/components/admin/StatCards'
import { ConfirmRoleDialog, type PendingRoleChange } from '@/components/admin/ConfirmRoleDialog'
import { CreateAccountDialog } from '@/components/admin/CreateAccountDialog'
import { ResetCredentialsDialog } from '@/components/admin/ResetCredentialsDialog'
import * as api from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROLES, roleLabel, type Employee, type Role } from '@/lib/types'

export default function ITAdminPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [view, setView] = useState<View>('dashboard')
  const [createOpen, setCreateOpen] = useState(false)
  const [titleChange, setTitleChange] = useState<{ employee: Employee; title: string } | null>(null)
  const [roleChange, setRoleChange] = useState<PendingRoleChange | null>(null)
  const [resetTarget, setResetTarget] = useState<Employee | null>(null)
  const [toggleTarget, setToggleTarget] = useState<Employee | null>(null)

  const refresh = useCallback(async () => {
    try {
      setEmployees(await api.listEmployees())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Runs an API action, refreshes the list, and reports success/failure.
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action()
      await refresh()
      toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
      throw e
    }
  }

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
        ? setToggleTarget(e)
        : run(() => api.setActive(e.id, true), 'Account reactivated').catch(() => {}),
  }

  const recent = employees.slice(-5).reverse()

  return (
    <AdminShell view={view} onNavigate={setView}>
      {view === 'dashboard' ? (
        <div className="grid gap-6">
          <div>
            <h2 className="text-2xl font-bold">Hello, IT Administrator</h2>
            <p className="text-sm text-muted-foreground">Manage user accounts, roles, and system access.</p>
          </div>
          <StatCards employees={employees} />
          <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Recently added</CardTitle>
                <CardDescription>The latest accounts created.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {recent.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">{e.id} · {e.email}</div>
                    </div>
                    <Badge variant="secondary">{e.title}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="self-start">
              <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
              <CardContent className="grid gap-2">
                <Button className="justify-between" onClick={() => setCreateOpen(true)}>
                  <span className="flex items-center gap-2"><UserPlus /> Create New Account</span><ChevronRight />
                </Button>
                <Button variant="outline" className="justify-between" onClick={() => setView('users')}>
                  <span className="flex items-center gap-2"><Users /> View All Users</span><ChevronRight />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Users</CardTitle>
                <CardDescription>View and manage all registered users.</CardDescription>
              </div>
              <Button onClick={() => setCreateOpen(true)}><Plus /> Create account</Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
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
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <EmployeeTable employees={filtered} loading={loading} actions={actions} />
          </CardContent>
        </Card>
      )}

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} employees={employees}
        onSubmit={(input) => run(() => api.createAccount(input), 'Account created')} />
      <ConfirmRoleDialog change={roleChange} onClose={() => setRoleChange(null)}
        onConfirm={(c, pw) => run(() => api.changeRole(c.employee.id, c.role, pw), `${c.employee.name} is now ${roleLabel(c.role)}`)} />
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
              run(() => api.changeTitle(c.employee.id, c.title), `${c.employee.name} is now ${c.title}`).catch(() => {})
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ResetCredentialsDialog employee={resetTarget} onClose={() => setResetTarget(null)}
        onSubmit={(id, input) => run(() => api.resetCredentials(id, input), 'Credentials updated')} />

      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.active ? 'Deactivate' : 'Reactivate'} {toggleTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.active
                ? 'They will no longer be able to sign in. You can reactivate the account later.'
                : 'They will be able to sign in again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const t = toggleTarget!
              run(() => api.setActive(t.id, !t.active), t.active ? 'Account deactivated' : 'Account reactivated').catch(() => {})
            }}>
              {toggleTarget?.active ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  )
}
