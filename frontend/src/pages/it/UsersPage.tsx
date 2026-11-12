import { Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmRoleDialog, type PendingRoleChange } from '@/components/it/ConfirmRoleDialog'
import { CreateAccountDialog } from '@/components/it/CreateAccountDialog'
import { EditUserDialog } from '@/components/it/EditUserDialog'
import { UserTable } from '@/components/it/UserTable'
import PageHeader from '@/components/PageHeader'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { itApi } from '@/lib/it/api'
import { runAction, useMe, usePositions, useTeams } from '@/lib/it/hooks'
import { ROLES, fullName, roleLabel, type Role, type Status, type User, type UsersPage } from '@/lib/it/types'

const PAGE_SIZE = 10

export default function UsersPage() {
  const me = useMe()
  const positions = usePositions().items
  const { items: teams, refresh: refreshTeams } = useTeams()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState<Status | 'all'>('all')
  const [role, setRole] = useState<Role | 'all'>('all')
  const [teamId, setTeamId] = useState('all')
  const [offset, setOffset] = useState(0)
  const [page, setPage] = useState<UsersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0) // bump to reload after a change

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [roleChange, setRoleChange] = useState<PendingRoleChange | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setOffset(0) }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let stale = false
    itApi.listUsers({
      search: debounced || undefined,
      status: status === 'all' ? undefined : status,
      role: role === 'all' ? undefined : role,
      teamId: teamId === 'all' ? undefined : Number(teamId),
      sort: 'name', order: 'asc', limit: PAGE_SIZE, offset,
    })
      .then((p) => { if (!stale) setPage(p) })
      .catch((e: Error) => { if (!stale) toast.error(`Couldn't load users: ${e.message}`) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [debounced, status, role, teamId, offset, version])

  const reload = () => { setVersion((v) => v + 1); refreshTeams() }
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setOffset(0) }

  const total = page?.total ?? 0
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(offset + PAGE_SIZE, total)

  const actions = {
    onChangeRole: (user: User, next: Role) => setRoleChange({ user, role: next }),
    onEdit: setEditTarget,
    // Deactivating asks for confirmation; reactivating is harmless, so it's immediate.
    onToggleStatus: (u: User) =>
      u.status === 'ACTIVE'
        ? setDeactivateTarget(u)
        : runAction(() => itApi.setStatus(u.employeeId, 'ACTIVE'), `${fullName(u)} reactivated`, reload).catch(() => {}),
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Users" description="View and manage all registered users.">
        <Button onClick={() => setCreateOpen(true)}><Plus /> Create account</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={role} onValueChange={filter((v: string) => setRole(v as Role | 'all'))}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All access roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={filter(setTeamId)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => <SelectItem key={t.teamId} value={String(t.teamId)}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={filter((v: string) => setStatus(v as Status | 'all'))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <UserTable users={page?.users ?? []} loading={loading} currentUserId={me?.employeeId} actions={actions} />
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>{total === 0 ? 'No users' : `Showing ${from}–${to} of ${total}`}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={to >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
          </div>
        </div>
      </div>

      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} positions={positions} teams={teams}
        onSubmit={(input) => runAction(() => itApi.createAccount(input), 'Account created', reload)} />
      <EditUserDialog user={editTarget} positions={positions} teams={teams} onClose={() => setEditTarget(null)}
        onSave={(id, input) => runAction(() => itApi.updateUser(id, input), 'User updated', reload)}
        onResetPassword={(u) => runAction(() => itApi.resetPassword(u.employeeId), `Reset email sent to ${u.email}`)} />
      <ConfirmRoleDialog change={roleChange} onClose={() => setRoleChange(null)}
        onConfirm={(c) => {
          setRoleChange(null)
          runAction(() => itApi.setRole(c.user.employeeId, c.role), `${fullName(c.user)} is now ${roleLabel(c.role)}`, reload).catch(() => {})
        }} />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget && fullName(deactivateTarget)}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be signed out everywhere and won't be able to sign in. You can reactivate the account later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const u = deactivateTarget!
              runAction(() => itApi.setStatus(u.employeeId, 'DEACTIVATED'), `${fullName(u)} deactivated`, reload).catch(() => {})
            }}>Deactivate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
