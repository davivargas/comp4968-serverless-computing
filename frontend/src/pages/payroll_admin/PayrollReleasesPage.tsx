import { CheckCircle2, CircleAlert, ExternalLink, LockKeyhole, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { payrollAdminApi } from '@/lib/payroll_admin/api'
import type { PayPeriod } from '@/lib/payroll_admin/types'

const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
export default function PayrollReleasesPage() {
  const [periods, setPeriods] = useState<PayPeriod[]>([]); const [loading, setLoading] = useState(true); const [releasing, setReleasing] = useState<string | null>(null)
  const load = () => payrollAdminApi.listPayPeriods().then(setPeriods).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  const release = async (period: PayPeriod) => { setReleasing(period.payPeriodId); try { await payrollAdminApi.releasePayroll(period.payPeriodId); toast.success(`Payroll released for ${date(period.start)} – ${date(period.end)}`); await load() } catch (e) { toast.error(e instanceof Error ? e.message : 'Payroll could not be released') } finally { setReleasing(null) } }
  return <div className="mx-auto max-w-[1200px]"><PageHeader title="Payroll Releases" description="Review approvals and release completed bi-weekly pay periods." /><Card><Table><TableHeader><TableRow><TableHead>Pay period</TableHead><TableHead>Pay date</TableHead><TableHead>Employees</TableHead><TableHead>Approvals</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.payPeriodId}><TableCell><p className="font-medium">{date(period.start)} – {date(period.end)}</p><p className="text-xs text-muted-foreground">{period.payPeriodId}</p></TableCell><TableCell>{date(period.payDate)}</TableCell><TableCell>{period.employeeCount}</TableCell><TableCell>{period.unapprovedCount === 0 ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-4" /> All approved</span> : <span className="flex items-center gap-1 text-amber-600"><CircleAlert className="size-4" /> {period.unapprovedCount} pending</span>}</TableCell><TableCell>{period.status === 'RELEASED' ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100" variant="secondary">Released</Badge> : <Badge variant="outline">Open</Badge>}</TableCell><TableCell className="text-right">{period.status === 'RELEASED' ? <span className="text-xs text-muted-foreground">{period.releasedAt ? `Released ${date(period.releasedAt.slice(0, 10))}` : 'Complete'}</span> : <Button size="sm" disabled={!period.canRelease || releasing === period.payPeriodId} onClick={() => release(period)}>{period.canRelease ? <><Send /> {releasing === period.payPeriodId ? 'Releasing...' : 'Release payroll'}</> : <><LockKeyhole /> Not ready</>}</Button>}</TableCell></TableRow>)}</TableBody></Table>{loading && <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading pay periods...</CardContent>}{!loading && !periods.length && <CardContent className="p-8 text-center text-sm text-muted-foreground">No pay periods found.</CardContent>}</Card><div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><ExternalLink className="size-4" /> Release is available only when the period has ended and every entry is approved.</div></div>
}
