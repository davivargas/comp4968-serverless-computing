import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { TITLE_GROUPS } from '@/lib/it/titles'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ROLES, type Employee, type Role } from '@/lib/it/types'

export interface RowActions {
  onChangeTitle: (e: Employee, title: string) => void
  onChangeRole: (e: Employee, role: Role) => void
  onResetCredentials: (e: Employee) => void
  onToggleActive: (e: Employee) => void
}

export function EmployeeTable({
  employees, loading, actions,
}: { employees: Employee[]; loading: boolean; actions: RowActions }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Manager</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          Array.from({ length: 5 }, (_, i) => (
            <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
          ))
        ) : employees.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No employees found.</TableCell></TableRow>
        ) : employees.map((e) => (
          <TableRow key={e.id} className={e.active ? '' : 'text-muted-foreground'}>
            <TableCell className="font-mono text-xs">{e.id}</TableCell>
            <TableCell className="font-medium">{e.name}</TableCell>
            <TableCell>{e.email}</TableCell>
            <TableCell>
              <Select value={e.title} onValueChange={(v) => actions.onChangeTitle(e, v)}>
                <SelectTrigger size="sm" className="w-56" aria-label={`Title for ${e.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TITLE_GROUPS.map((g) => (
                    <SelectGroup key={g.track}>
                      <SelectLabel>{g.track}</SelectLabel>
                      {g.titles.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Select value={e.role} onValueChange={(v) => actions.onChangeRole(e, v as Role)}>
                <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${e.name}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              {e.managerId ? <>{e.managerName} <span className="font-mono text-xs">({e.managerId})</span></> : '—'}
            </TableCell>
            <TableCell>
              <label className="flex items-center gap-2">
                <Switch checked={e.active} onCheckedChange={() => actions.onToggleActive(e)}
                  aria-label={`${e.active ? 'Deactivate' : 'Reactivate'} ${e.name}`} />
                <span className="text-xs">{e.active ? 'Active' : 'Deactivated'}</span>
              </label>
            </TableCell>
            <TableCell className="text-right">
              <Button size="sm" variant="outline" onClick={() => actions.onResetCredentials(e)}>Reset email / password</Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
