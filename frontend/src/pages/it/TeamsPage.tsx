import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TeamDialog } from '@/components/it/TeamDialog'
import PageHeader from '@/components/PageHeader'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { itApi } from '@/lib/it/api'
import { runAction, useTeams } from '@/lib/it/hooks'
import type { Team, User } from '@/lib/it/types'

export default function TeamsPage() {
  const { items: teams, loading, refresh } = useTeams()
  const [managers, setManagers] = useState<User[]>([])
  const [dialog, setDialog] = useState<{ team: Team | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null)

  // Only active users with the Manager role can manage a team.
  useEffect(() => {
    itApi.listUsers({ role: 'MANAGER', status: 'ACTIVE', limit: 200, sort: 'name' }).then((p) => setManagers(p.users)).catch(() => {})
  }, [])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Teams" description="A team is a department: the people one manager manages.">
        <Button onClick={() => setDialog({ team: null })}><Plus /> Create team</Button>
      </PageHeader>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead className="w-28">Members</TableHead>
              <TableHead className="w-44 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }, (_, i) => <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
            ) : teams.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No teams yet.</TableCell></TableRow>
            ) : teams.map((t) => (
              <TableRow key={t.teamId}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell>
                  <div>{t.managerName}</div>
                  <div className="text-xs text-muted-foreground">{t.managerId}</div>
                </TableCell>
                <TableCell className="tabular-nums">{t.memberCount}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDialog({ team: t })}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteTarget(t)}>Delete</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TeamDialog open={!!dialog} team={dialog?.team ?? null} managers={managers} onClose={() => setDialog(null)}
        onSubmit={(input) => dialog?.team
          ? runAction(() => itApi.updateTeam(dialog.team!.teamId, input), 'Team updated', refresh)
          : runAction(() => itApi.createTeam(input), 'Team created', refresh)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The team will stop being listed and can't be given to employees. A team that still has employees can't be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const t = deleteTarget!
              runAction(() => itApi.deleteTeam(t.teamId), `${t.name} deleted`, refresh).catch(() => {})
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
