import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { entryHours, formatHours } from '@/lib/employee/dates'
import { managerApi } from '@/lib/manager/api'
import { useManagerData } from '@/lib/manager/useManagerData'
import type { ManagerTimesheet, TimesheetQuery } from '@/lib/manager/types'

export default function TimesheetsPage() {
  const { employees, error: teamError } = useManagerData()
  const [from, setFrom] = useState('2026-11-09'), [to, setTo] = useState('2026-11-22')
  const [employeeId, setEmployeeId] = useState(''), [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0), [version, setVersion] = useState(0)
  const [rows, setRows] = useState<ManagerTimesheet[]>([]), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    if (!from || !to || from > to) { setError('Choose a valid date range.'); setLoading(false); return }
    managerApi.listTimesheets({ from, to, employeeId, status: status === 'all' ? undefined : status as TimesheetQuery['status'], limit: 50, offset })
      .then(r => { if (active) setRows(r.timesheets) }).catch(e => { if (active) setError(String(e.message)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [from, to, employeeId, status, offset, version])
  async function review() {
    if (!action) return
    setBusy(true)
    try { await managerApi.reviewPeriod(employeeId, action, { from, to }); toast.success(action === 'approve' ? 'Pay period approved' : 'Pay period returned for changes'); setAction(null); setVersion(v => v + 1) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Review failed') }
    finally { setBusy(false) }
  }
  const selectClass = 'h-9 rounded-md border bg-background px-3 text-sm'
  return <div className="mx-auto grid max-w-6xl gap-6"><PageHeader title="Timesheets" description="Review entries, then approve or return an employee's complete pay period." />
    <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-2"><Label htmlFor="from">From</Label><Input id="from" type="date" value={from} onChange={e => { setFrom(e.target.value); setOffset(0) }} /></div>
      <div className="grid gap-2"><Label htmlFor="to">To</Label><Input id="to" type="date" value={to} onChange={e => { setTo(e.target.value); setOffset(0) }} /></div>
      <div className="grid gap-2"><Label htmlFor="employee">Employee</Label><select id="employee" className={selectClass} value={employeeId} onChange={e => { setEmployeeId(e.target.value); setOffset(0) }}><option value="">All employees</option>{employees.map(e => <option key={e.employeeId} value={e.employeeId}>{e.firstName} {e.lastName}</option>)}</select></div>
      <div className="grid gap-2"><Label htmlFor="status">Status</Label><select id="status" className={selectClass} value={status} onChange={e => { setStatus(e.target.value); setOffset(0) }}>{['all', 'pending', 'approved', 'unsubmitted'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
    </CardContent></Card>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={!employeeId || loading || !!error || busy} onClick={() => setAction('approve')}>Approve pay period</Button><Button variant="outline" disabled={!employeeId || loading || !!error || busy} onClick={() => setAction('reject')}>Return for changes</Button><span className="text-sm text-muted-foreground">Select one employee. Actions include all entries in the period, regardless of the status filter.</span></div>
    {teamError && <p role="alert">{teamError}</p>}
    {error ? <div role="alert">{error} <Button variant="outline" onClick={() => setVersion(v => v + 1)}>Retry</Button></div> : loading ? <Skeleton className="h-64" /> : <Card><CardContent><Table><TableHeader><TableRow>{['Employee', 'Date', 'Time', 'Project', 'Hours', 'Status'].map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(t => <TableRow key={t.timesheetId}><TableCell>{t.employeeName}</TableCell><TableCell>{t.date}</TableCell><TableCell>{t.startTime}–{t.endTime}</TableCell><TableCell>{t.projectCode} · {t.projectName}</TableCell><TableCell>{formatHours(entryHours(t))}</TableCell><TableCell><Badge variant={t.approved ? 'secondary' : 'outline'}>{t.approved ? 'Approved' : t.submitted ? 'Pending' : 'Unsubmitted'}</Badge></TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={6}>No timesheets match these filters.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>}
    <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(o => Math.max(0, o - 50))}>Previous</Button><span className="text-sm">Page {offset / 50 + 1}</span><Button variant="outline" disabled={rows.length < 50 || loading} onClick={() => setOffset(o => o + 50)}>Next</Button></div>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null) }}><DialogContent><DialogHeader><DialogTitle>{action === 'approve' ? 'Approve pay period?' : 'Return pay period for changes?'}</DialogTitle><DialogDescription>All entries for {employees.find(e => e.employeeId === employeeId)?.firstName} from {from} to {to} will be {action === 'approve' ? 'approved' : 'unsubmitted and unapproved so they can be edited'}. The backend validates the complete pay period.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Cancel</Button><Button disabled={busy} onClick={() => void review()}>{busy ? 'Saving…' : 'Confirm'}</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
