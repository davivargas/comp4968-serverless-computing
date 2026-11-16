import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useEmployeeId } from '@/components/auth/session-context'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { employeeApi } from '@/lib/employee/api'
import { addDays, entryHours, formatDate, formatHours, fromISODate, toISODate } from '@/lib/employee/dates'
import type { PayPeriod } from '@/lib/employee/types'
import { managerApi } from '@/lib/manager/api'
import { loadPeriodEntries, summarizePeriod } from '@/lib/manager/timesheets'
import type { EmployeePeriodSummary } from '@/lib/manager/timesheets'

export default function TimesheetsPage() {
  const managerId = useEmployeeId()
  const [date, setDate] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [status, setStatus] = useState('all')
  const [version, setVersion] = useState(0)
  const [data, setData] = useState<{ period: PayPeriod; summaries: EmployeePeriodSummary[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const period = await employeeApi.getPayPeriod(managerId, date || undefined)
        const entries = await loadPeriodEntries(managerApi, { from: period.start, to: period.end })
        if (active) setData({ period, summaries: summarizePeriod(entries) })
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load pay period')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [managerId, date, version])

  const selected = data?.summaries.find(s => s.employeeId === selectedId)
  const visible = data?.summaries.filter(s => (!employeeId || s.employeeId === employeeId)
    && (status === 'all' || s.status === status)) ?? []
  const periodLabel = data ? `${formatDate(data.period.start)} – ${formatDate(data.period.end)}` : ''
  function changePeriod(value: string) {
    setSelectedId(null)
    setAction(null)
    setDate(value)
  }
  async function review() {
    if (!action || !selected || !data) return
    setBusy(true)
    try {
      await managerApi.reviewPeriod(selected.employeeId, action, { from: data.period.start, to: data.period.end })
      toast.success(action === 'approve' ? 'Pay period approved' : 'Pay period returned for changes')
      setAction(null)
      setVersion(v => v + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed')
    } finally { setBusy(false) }
  }

  return <div className="mx-auto grid max-w-6xl gap-6">
    <PageHeader title="Timesheets" description="Review each employee's pay period. Open a summary to see individual dates and projects." />
    <Card><CardContent className="grid gap-4 pt-6 lg:grid-cols-[2fr_1fr_1fr]">
      <div className="grid gap-2">
        <Label htmlFor="period-date">Pay period containing</Label>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" aria-label="Previous pay period" disabled={!data || loading} onClick={() => data && changePeriod(toISODate(addDays(fromISODate(data.period.start), -1)))}><ChevronLeft /></Button>
          <Input id="period-date" type="date" value={date || data?.period.start || ''} onChange={e => changePeriod(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Next pay period" disabled={!data || loading || data.period.isCurrent} onClick={() => data && changePeriod(toISODate(addDays(fromISODate(data.period.end), 1)))}><ChevronRight /></Button>
        </div>
        {data && <p className="text-sm text-muted-foreground">{periodLabel}{data.period.isCurrent ? ' · Current period' : ''}</p>}
      </div>
      <div className="grid content-start gap-2"><Label htmlFor="employee">Employee</Label>
        <select id="employee" className="h-9 rounded-md border bg-background px-3 text-sm" value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
          <option value="">All employees</option>
          {data?.summaries.map(s => <option key={s.employeeId} value={s.employeeId}>{s.employeeName}</option>)}
        </select>
      </div>
      <div className="grid content-start gap-2"><Label htmlFor="status">Period status</Label>
        <select id="status" className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {['Pending', 'Approved', 'Partially submitted', 'Unsubmitted'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
    </CardContent></Card>
    {error ? <div role="alert">{error} <Button variant="outline" onClick={() => setVersion(v => v + 1)}>Retry</Button></div>
      : loading ? <Skeleton className="h-64" />
        : <Card><CardContent><Table>
          <TableHeader><TableRow>{['Employee', 'Pay period', 'Days logged', 'Total hours', 'Status', ''].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{visible.map(s => <TableRow key={s.employeeId} className="cursor-pointer" onClick={() => setSelectedId(s.employeeId)}>
            <TableCell className="font-medium">{s.employeeName}</TableCell>
            <TableCell>{periodLabel}</TableCell><TableCell>{s.days}</TableCell><TableCell>{formatHours(s.hours)}</TableCell>
            <TableCell><Badge variant={s.status === 'Approved' ? 'secondary' : 'outline'}>{s.status}</Badge></TableCell>
            <TableCell><Button variant="outline" size="sm" aria-label={`View ${s.employeeName}'s timesheet details`} onClick={e => { e.stopPropagation(); setSelectedId(s.employeeId) }}>View details</Button></TableCell>
          </TableRow>)}
            {!visible.length && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No employee timesheets match this pay period and these filters.</TableCell></TableRow>}
          </TableBody>
        </Table></CardContent></Card>}

    <Dialog open={!!selected} onOpenChange={open => { if (!open && !busy) { setSelectedId(null); setAction(null) } }}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{selected?.employeeName} — Pay period</DialogTitle><DialogDescription>{periodLabel}. Review all dates before approving or returning the complete period.</DialogDescription></DialogHeader>
        {selected && <>
          <div className="flex flex-wrap items-center gap-4 text-sm"><Badge variant="secondary">{selected.status}</Badge><span>{formatHours(selected.hours)} total</span><span>{selected.days} days logged</span><span>{selected.entries.length} entries</span></div>
          <Table><TableHeader><TableRow>{['Date', 'Time', 'Project', 'Hours', 'Status'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{selected.entries.map(t => <TableRow key={t.timesheetId}>
              <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell><TableCell>{t.startTime}–{t.endTime}</TableCell><TableCell>{t.projectCode} · {t.projectName}</TableCell><TableCell>{formatHours(entryHours(t))}</TableCell>
              <TableCell><Badge variant={t.approved ? 'secondary' : 'outline'}>{t.approved ? 'Approved' : t.submitted ? 'Pending' : 'Unsubmitted'}</Badge></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!selected.canApprove && selected.status !== 'Approved' && <p className="text-sm text-muted-foreground">All entries must be submitted before this pay period can be approved.</p>}
          {error && <p role="alert">{error}</p>}
          {action ? <div className="grid gap-3 rounded-lg border p-4">
            <p className="font-medium">{action === 'approve' ? 'Approve this pay period?' : 'Return this pay period for changes?'}</p>
            <p className="text-sm text-muted-foreground">This will {action === 'approve' ? 'approve' : 'unsubmit and unapprove'} all entries for {selected.employeeName} in {periodLabel}.</p>
            <div className="flex gap-2"><Button disabled={busy || loading || !!error} onClick={() => void review()}>{busy ? 'Saving…' : 'Confirm'}</Button><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Cancel</Button></div>
          </div> : <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setSelectedId(null)}>Close</Button>
            <Button variant="outline" disabled={!selected.canReturn || busy || loading || !!error} onClick={() => setAction('reject')}>Return for changes</Button>
            <Button disabled={!selected.canApprove || busy || loading || !!error} onClick={() => setAction('approve')}>Approve pay period</Button>
          </DialogFooter>}
        </>}
      </DialogContent>
    </Dialog>
  </div>
}
