import { ClipboardCheck, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { payrollAdminApi } from '@/lib/payroll_admin/api'
import type { PayPeriod } from '@/lib/payroll_admin/types'

type AuditEntry = { id: string; timestamp: string; action: string; actor: string; target: string; status: 'Completed' | 'Pending' }
const formatDate = (value: string) => new Date(value).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
export default function PayrollAuditPage() {
  const [periods, setPeriods] = useState<PayPeriod[]>([]); const [query, setQuery] = useState(''); const [action, setAction] = useState('all')
  useEffect(() => { payrollAdminApi.listPayPeriods().then(setPeriods) }, [])
  const entries = useMemo<AuditEntry[]>(() => periods.map((p) => ({ id: p.payPeriodId, timestamp: p.releasedAt ?? `${p.end}T17:00:00`, action: p.status === 'RELEASED' ? 'Payroll released' : 'Pay period reviewed', actor: 'Payroll Admin', target: `${p.start} – ${p.end}`, status: p.status === 'RELEASED' ? 'Completed' : 'Pending' })), [periods])
  const filtered = entries.filter((entry) => (action === 'all' || entry.action === action) && (!query || `${entry.actor} ${entry.target} ${entry.action} ${entry.id}`.toLowerCase().includes(query.toLowerCase())))
  return <div className="mx-auto max-w-[1200px]"><PageHeader title="Audit Log" description="Review payroll-administrator actions and pay-period activity." /><div className="mb-5 flex flex-wrap gap-2"><div className="relative min-w-64 flex-1 sm:max-w-md"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search audit activity..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><Select value={action} onValueChange={setAction}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem><SelectItem value="Payroll released">Payroll released</SelectItem><SelectItem value="Pay period reviewed">Pay period reviewed</SelectItem></SelectContent></Select></div><Card><Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Target</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{filtered.map((entry) => <TableRow key={entry.id}><TableCell className="text-muted-foreground">{formatDate(entry.timestamp)}</TableCell><TableCell className="font-medium"><span className="flex items-center gap-2"><ClipboardCheck className="size-4 text-primary" />{entry.action}</span></TableCell><TableCell>{entry.actor}</TableCell><TableCell>{entry.target}<div className="text-xs text-muted-foreground">{entry.id}</div></TableCell><TableCell><Badge variant={entry.status === 'Completed' ? 'secondary' : 'outline'}>{entry.status}</Badge></TableCell></TableRow>)}</TableBody></Table>{!filtered.length && <p className="p-8 text-center text-sm text-muted-foreground">No audit activity matches these filters.</p>}</Card><p className="mt-3 text-xs text-muted-foreground">Audit entries are derived from pay-period activity until a dedicated audit endpoint is available.</p></div>
}
