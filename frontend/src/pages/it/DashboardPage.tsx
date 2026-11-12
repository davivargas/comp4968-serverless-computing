import { ChevronRight, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreateAccountDialog } from '@/components/it/CreateAccountDialog'
import { StatCards } from '@/components/it/StatCards'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { itApi } from '@/lib/it/api'
import { runAction, usePositions, useTeams } from '@/lib/it/hooks'
import { fullName, roleLabel, type User } from '@/lib/it/types'

export default function DashboardPage() {
  const positions = usePositions().items
  const teams = useTeams().items
  const [counts, setCounts] = useState<{ total: number; active: number; deactivated: number } | null>(null)
  const [recent, setRecent] = useState<User[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      // limit 1: we only need each list's total
      const [all, active, deactivated, latest] = await Promise.all([
        itApi.listUsers({ limit: 1 }),
        itApi.listUsers({ status: 'ACTIVE', limit: 1 }),
        itApi.listUsers({ status: 'DEACTIVATED', limit: 1 }),
        itApi.listUsers({ sort: 'id', order: 'desc', limit: 5 }),
      ])
      setCounts({ total: all.total, active: active.total, deactivated: deactivated.total })
      setRecent(latest.users)
    } catch { /* the Users page reports load errors; keep skeletons here */ }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader title="Dashboard" description="Manage user accounts, roles, and system access." />
      {counts ? <StatCards {...counts} /> : <Skeleton className="h-24" />}
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recently added</CardTitle>
            <CardDescription>The latest accounts created.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {!recent
              ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)
              : recent.map((u) => (
                <div key={u.employeeId} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{fullName(u)}</div>
                    <div className="text-xs text-muted-foreground">{u.employeeId} · {u.position}</div>
                  </div>
                  <Badge variant="secondary">{roleLabel(u.role)}</Badge>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <Button className="justify-between" onClick={() => setCreateOpen(true)}>
              <span className="flex items-center gap-2"><UserPlus /> Create new account</span><ChevronRight />
            </Button>
            <Button asChild variant="outline" className="justify-between">
              <Link to="/it/users"><span className="flex items-center gap-2"><Users /> View all users</span><ChevronRight /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} positions={positions} teams={teams}
        onSubmit={(input) => runAction(() => itApi.createAccount(input), 'Account created', load)} />
    </div>
  )
}
