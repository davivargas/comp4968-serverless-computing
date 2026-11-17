import { ClipboardCheck, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { payrollAdminApi } from '@/lib/payroll_admin/api'
import type { AuditLogEntry } from '@/lib/payroll_admin/types'

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })
}
const fieldLabel = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const displayValue = (value: unknown) => {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
function ChangeDetails({ entry }: { entry: AuditLogEntry }) {
  const before = entry.oldValues ?? {}
  const after = entry.newValues ?? {}
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  if (!fields.length) return <span className="text-muted-foreground">No field details</span>
  return <ul className="space-y-1">{fields.map((field) => <li key={field}><span className="font-medium">{fieldLabel(field)}:</span>{field in before && field in after ? <> <span className="text-muted-foreground">{displayValue(before[field])}</span><span className="mx-1">→</span><span>{displayValue(after[field])}</span></> : <> {displayValue(field in after ? after[field] : before[field])}</>}</li>)}</ul>
}

export default function PayrollAuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [query, setQuery] = useState('')
  const [action, setAction] = useState('all')
  const [from, setFrom] = useState(() => new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (token?: string, append = false) => {
    setLoading(true); setError('')
    try {
      const result = await payrollAdminApi.listAuditLogs({ from, to, action: action === 'all' ? undefined : action, limit: 50, nextToken: token })
      setLogs((existing) => append ? [...existing, ...result.logs] : result.logs)
      setNextToken(result.nextToken)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load audit activity.')
      if (!append) setLogs([])
    } finally { setLoading(false) }
  }, [from, to, action])

  useEffect(() => { void load() }, [load])
  const filtered = logs.filter((entry) => !query || `${entry.auditId} ${entry.table} ${entry.recordId} ${entry.action} ${entry.changedByName ?? ''} ${entry.changedBy ?? ''}`.toLowerCase().includes(query.toLowerCase()))

  return <div className="mx-auto max-w-[1200px]"><PageHeader title="Audit Log" description="Review recorded changes across payroll and employee records." /><div className="mb-5 flex flex-wrap gap-2"><div className="relative min-w-64 flex-1 sm:max-w-md"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search audit activity..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><Input aria-label="From date" type="date" className="w-40" value={from} onChange={(event) => setFrom(event.target.value)} /><Input aria-label="To date" type="date" className="w-40" value={to} onChange={(event) => setTo(event.target.value)} /><Select value={action} onValueChange={setAction}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All actions</SelectItem><SelectItem value="INSERT">Insert</SelectItem><SelectItem value="UPDATE">Update</SelectItem><SelectItem value="DELETE">Delete</SelectItem></SelectContent></Select></div>
    {error && <Card className="mb-4 p-4 text-sm text-destructive" role="alert">Could not load audit logs: {error}</Card>}
    <Card><Table><TableHeader><TableRow><TableHead>Timestamp</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Record</TableHead><TableHead>Changes</TableHead></TableRow></TableHeader><TableBody>{filtered.map((entry) => <TableRow key={entry.auditId}><TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(entry.changedAt)}</TableCell><TableCell><Badge variant={entry.action === 'DELETE' ? 'destructive' : 'secondary'}><ClipboardCheck className="mr-1 size-3" />{entry.action}</Badge></TableCell><TableCell>{entry.changedByName || (entry.changedBy == null ? 'System' : `Employee ${entry.changedBy}`)}</TableCell><TableCell><span className="font-medium">{entry.table}</span><div className="text-xs text-muted-foreground">ID: {entry.recordId}</div></TableCell><TableCell className="max-w-sm text-xs"><ChangeDetails entry={entry} /></TableCell></TableRow>)}</TableBody></Table>{!loading && filtered.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{error ? 'Audit activity is unavailable.' : 'No audit activity matches these filters.'}</p>}{loading && <p className="p-4 text-center text-sm text-muted-foreground">Loading audit activity…</p>}</Card>
    {nextToken && <div className="mt-4 flex justify-center"><Button variant="outline" disabled={loading} onClick={() => void load(nextToken, true)}>{loading ? 'Loading…' : 'Load more'}</Button></div>}
  </div>
}
