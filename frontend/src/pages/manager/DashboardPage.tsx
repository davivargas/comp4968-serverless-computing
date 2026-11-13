import { Link } from 'react-router-dom'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagerData } from '@/lib/manager/useManagerData'

export default function DashboardPage() {
  const { employees, projects, loading, error, reload } = useManagerData()
  return <div className="mx-auto grid max-w-6xl gap-6">
    <PageHeader title="Dashboard" description="Review your team's time and manage project assignments." />
    {error ? <div role="alert">{error} <Button onClick={() => void reload()}>Retry</Button></div> : loading ? <Skeleton className="h-28" /> : <div className="grid gap-4 sm:grid-cols-3">
      {[['Team members', employees.length], ['Active employees', employees.filter(e => e.status === 'ACTIVE').length], ['Active projects', projects.filter(p => p.status === 'ACTIVE').length]].map(([label, count]) => <Card key={label}><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{count}</CardContent></Card>)}
    </div>}
    <Card><CardHeader><CardTitle>Quick actions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-3">
      <Button asChild><Link to="/manager/timesheets">Review timesheets</Link></Button>
      <Button asChild variant="outline"><Link to="/manager/projects">Manage projects</Link></Button>
      <Button asChild variant="outline"><Link to="/manager/team">View team</Link></Button>
    </CardContent></Card>
  </div>
}
