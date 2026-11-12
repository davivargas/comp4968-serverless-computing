import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useManagerData } from '@/lib/manager/useManagerData'

export default function TeamPage() {
  const { employees, loading, error, reload } = useManagerData()
  return <div className="mx-auto max-w-6xl"><PageHeader title="Team" description="Employees on teams you manage." />
    {error ? <div role="alert">{error} <Button onClick={() => void reload()}>Retry</Button></div> : loading ? <Skeleton className="h-48" /> : <Card><CardContent><Table>
      <TableHeader><TableRow>{['Employee', 'Position', 'Team', 'Status'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{employees.map(e => <TableRow key={e.employeeId}><TableCell><div className="font-medium">{e.firstName} {e.lastName}</div><div className="text-xs text-muted-foreground">{e.employeeId} · {e.email}</div></TableCell><TableCell>{e.position}</TableCell><TableCell>{e.team}</TableCell><TableCell><Badge variant={e.status === 'ACTIVE' ? 'secondary' : 'outline'}>{e.status}</Badge></TableCell></TableRow>)}
        {!employees.length && <TableRow><TableCell colSpan={4}>No team members found.</TableCell></TableRow>}
      </TableBody></Table></CardContent></Card>}
  </div>
}
