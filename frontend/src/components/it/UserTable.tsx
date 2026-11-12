import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROLES, fullName, type Role, type User } from '@/lib/it/types'

export interface RowActions {
  onChangeRole: (u: User, role: Role) => void
  onToggleStatus: (u: User) => void
  onEdit: (u: User) => void
}

export function UserTable({
  users, loading, currentUserId, actions,
}: { users: User[]; loading: boolean; currentUserId: string | undefined; actions: RowActions }) {
  return (
    <Table className="min-w-[50rem] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-72">Employee</TableHead>
          <TableHead className="w-44">Position</TableHead>
          <TableHead>Team / manager</TableHead>
          <TableHead className="w-40">Access</TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-20 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
          ))
        ) : users.length === 0 ? (
          <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No users found.</TableCell></TableRow>
        ) : users.map((u) => {
          const isSelf = u.employeeId === currentUserId
          const active = u.status === 'ACTIVE'
          return (
            <TableRow key={u.employeeId} className={active ? '' : 'text-muted-foreground'}>
              <TableCell>
                <div className="font-medium">{fullName(u)}{isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>}</div>
                <div className="truncate text-xs text-muted-foreground">{u.employeeId} · {u.email}</div>
              </TableCell>
              <TableCell>{u.position}</TableCell>
              <TableCell>
                {u.team ? (
                  <>
                    <div>{u.team}</div>
                    <div className="text-xs text-muted-foreground">{u.managerName} · {u.managerId}</div>
                  </>
                ) : <span className="text-muted-foreground">No team</span>}
              </TableCell>
              <TableCell>
                <Select value={u.role} disabled={isSelf} onValueChange={(v) => actions.onChangeRole(u, v as Role)}>
                  <SelectTrigger size="sm" className="w-full" aria-label={`Access role for ${fullName(u)}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-2">
                  <Switch checked={active} disabled={isSelf} onCheckedChange={() => actions.onToggleStatus(u)}
                    aria-label={`${active ? 'Deactivate' : 'Reactivate'} ${fullName(u)}`} />
                  <span className="text-xs">{active ? 'Active' : 'Off'}</span>
                </label>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => actions.onEdit(u)}>Edit</Button>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
