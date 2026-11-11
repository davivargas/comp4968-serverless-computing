import { ChevronRight, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CreateAccountDialog } from '@/components/it/CreateAccountDialog'
import { StatCards } from '@/components/it/StatCards'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { itApi } from '@/lib/it/api'
import { roleLabel } from '@/lib/it/types'
import { useEmployees } from '@/lib/it/useEmployees'

export default function DashboardPage() {
  const { employees, loading, run } = useEmployees()
  const [createOpen, setCreateOpen] = useState(false)
  const recent = employees.slice(-5).reverse()

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <PageHeader title="Dashboard" description="Manage user accounts, roles, and system access." />
      {loading ? <Skeleton className="h-24" /> : <StatCards employees={employees} />}
      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Recently added</CardTitle>
            <CardDescription>The latest accounts created.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loading
              ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)
              : recent.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.id} · {e.title}</div>
                  </div>
                  <Badge variant="secondary">{roleLabel(e.role)}</Badge>
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
      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} employees={employees}
        onSubmit={(input) => run(() => itApi.createAccount(input), 'Account created')} />
    </div>
  )
}
