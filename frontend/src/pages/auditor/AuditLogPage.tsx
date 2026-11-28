import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Download, FilterX, RotateCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import PersonFilter from '@/components/auditor/PersonFilter'
import LoadError from '@/components/LoadError'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { auditorApi } from '@/lib/auditor/api'
import {
  actorName, changedFields, changeSummary, daysBefore, daysBetween, displayValue, formatTimestamp, humanize, todayBC, toCsv,
} from '@/lib/auditor/format'
import { AUDITED_TABLES, type AuditAction, type AuditLogEntry } from '@/lib/auditor/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 50
const MAX_RANGE_DAYS = 366
const ACTION_STYLE: Record<AuditAction, string> = {
  INSERT: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  UPDATE: 'border-sky-600/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  DELETE: 'border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400',
}
const ACTION_LABEL: Record<AuditAction, string> = { INSERT: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' }

/**
 * The audit trail. Filters live in the URL so a view can be bookmarked or shared, and so the
 * employee lookup can link straight to "changes made by" or "changes to" a person.
 */
export default function AuditLogPage() {
  const [params, setParams] = useSearchParams()
  const today = todayBC()
  const to = params.get('to') || today
  const from = params.get('from') || daysBefore(to, 90)
  const action = (params.get('action') || '') as AuditAction | ''
  const table = params.get('table') || ''
  const recordId = params.get('recordId') || ''
  const changedBy = params.get('changedBy') || ''
  const changedByName = params.get('by') || ''

  const [recordDraft, setRecordDraft] = useState(recordId)
  useEffect(() => setRecordDraft(recordId), [recordId])

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rangeError = from > to ? 'The start date must be on or before the end date.'
    : daysBetween(from, to) > MAX_RANGE_DAYS ? `The date range can be at most ${MAX_RANGE_DAYS} days.` : null

  const query = useMemo(
    () => ({ from, to, table, recordId, changedBy, action: action || undefined, limit: PAGE_SIZE }),
    [from, to, table, recordId, changedBy, action],
  )

  const load = useCallback(async (token?: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await auditorApi.listAuditLogs({ ...query, nextToken: token })
      setLogs((prev) => (token ? [...prev, ...res.logs] : res.logs))
      setNextToken(res.nextToken)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (rangeError) return
    setExpanded(null)
    void load()
  }, [load, rangeError])

  const set = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const filtered = !!(action || table || recordId || changedBy || params.get('from') || params.get('to'))

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(logs)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `audit-log_${from}_to_${to}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader title="Audit Log" description="Every recorded change to employee, timesheet, project and account data. Click a person or record in the table to filter by it.">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !!rangeError}><RotateCw className={cn(loading && 'animate-spin')} />Refresh</Button>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={logs.length === 0}><Download />Export CSV</Button>
        <Button variant="ghost" size="sm" disabled={!filtered} onClick={() => setParams(new URLSearchParams(), { replace: true })}><FilterX />Clear filters</Button>
      </PageHeader>

      <Card className="relative z-10 mb-4 overflow-visible p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="From" htmlFor="from">
            <Input id="from" type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value })} />
          </Field>
          <Field label="To" htmlFor="to">
            <Input id="to" type="date" value={to} max={today} onChange={(e) => set({ to: e.target.value })} />
          </Field>
          <Field label="Action">
            <Select value={action || 'all'} onValueChange={(v) => set({ action: v === 'all' ? '' : v })}>
              <SelectTrigger className="w-full" aria-label="Action"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {(Object.keys(ACTION_LABEL) as AuditAction[]).map((a) => <SelectItem key={a} value={a}>{ACTION_LABEL[a]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Changed by" htmlFor="changed-by">
            <PersonFilter id="changed-by" value={changedBy ? { id: changedBy, name: changedByName || `Employee ${changedBy}` } : null}
              onChange={(p) => set({ changedBy: p?.id ?? '', by: p?.name ?? '' })} />
          </Field>
          <Field label="Table">
            <Select value={table || 'all'} onValueChange={(v) => set({ table: v === 'all' ? '' : v, ...(v === 'all' && { recordId: '' }) })}>
              <SelectTrigger className="w-full" aria-label="Table"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tables</SelectItem>
                {AUDITED_TABLES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Record ID" htmlFor="record-id">
            <form onSubmit={(e) => { e.preventDefault(); set({ recordId: recordDraft.trim() }) }}>
              <Input id="record-id" placeholder={table ? 'Any' : 'Pick a table first'} value={recordDraft} disabled={!table}
                onChange={(e) => setRecordDraft(e.target.value)} onBlur={() => set({ recordId: recordDraft.trim() })} />
            </form>
          </Field>
        </div>
        {rangeError && <p role="alert" className="mt-3 text-sm text-destructive">{rangeError}</p>}
      </Card>

      {error && logs.length === 0 ? (
        <LoadError title="Couldn't load the audit log" message={error} onRetry={() => void load()} />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Changed by</TableHead>
                <TableHead className="w-[38%]">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((e) => {
                const open = expanded === e.auditId
                const when = formatTimestamp(e.changedAt)
                return (
                  <Fragment key={e.auditId}>
                    <TableRow className="cursor-pointer" aria-expanded={open} onClick={() => setExpanded(open ? null : e.auditId)}>
                      <TableCell className="pr-0"><ChevronRight className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')} /></TableCell>
                      <TableCell className="whitespace-nowrap"><div>{when.date}</div><div className="text-xs text-muted-foreground">{when.time}</div></TableCell>
                      <TableCell><Badge variant="outline" className={ACTION_STYLE[e.action]}>{ACTION_LABEL[e.action]}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <CellLink title="Show every change to this record" onClick={() => set({ table: e.table, recordId: e.recordId })}>
                          <div className="font-medium">{humanize(e.table)}</div><div className="text-xs text-muted-foreground">#{e.recordId}</div>
                        </CellLink>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {e.changedBy == null ? actorName(e) : (
                          <CellLink title="Show every change this person made" onClick={() => set({ changedBy: String(e.changedBy), by: actorName(e) })}>
                            <div>{actorName(e)}</div><div className="text-xs text-muted-foreground">ID {e.changedBy}</div>
                          </CellLink>
                        )}
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-sm text-muted-foreground" title={changeSummary(e)}>{changeSummary(e)}</TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={5} className="whitespace-normal py-4"><EntryDetails entry={e} /></TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
              {loading && Array.from({ length: logs.length ? 2 : 6 }, (_, i) => (
                <TableRow key={`s${i}`}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
          {!loading && logs.length === 0 && !rangeError && (
            <p className="p-10 text-center text-sm text-muted-foreground">No changes match these filters in this date range.</p>
          )}
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{logs.length > 0 && `Showing ${logs.length} ${logs.length === 1 ? 'change' : 'changes'}, newest first${nextToken ? '' : ' (all loaded)'}`}</span>
        {error && logs.length > 0 && <span role="alert" className="text-destructive">{error}</span>}
        {nextToken && <Button variant="outline" disabled={loading} onClick={() => void load(nextToken)}>{loading ? 'Loading…' : 'Load older changes'}</Button>}
      </div>
    </div>
  )
}

/** A table cell's content that applies a filter, without also toggling the row open. */
function CellLink({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} onClick={(ev) => { ev.stopPropagation(); onClick() }}
      className="-mx-1 rounded-sm px-1 text-left hover:bg-foreground/5 hover:underline hover:decoration-muted-foreground/50 hover:underline-offset-4">
      {children}
    </button>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <div className="grid gap-1.5"><Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>{children}</div>
}

function EntryDetails({ entry }: { entry: AuditLogEntry }) {
  const fields = changedFields(entry)
  return (
    <div className="grid gap-3">
      {fields.length === 0 ? <p className="text-sm text-muted-foreground">No field details were recorded.</p> : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b"><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">Before</th><th className="px-3 py-2 font-medium">After</th></tr>
            </thead>
            <tbody>
              {fields.map(({ field, before, after }) => (
                <tr key={field} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{humanize(field)}</td>
                  <td className={cn('px-3 py-2 font-mono text-xs break-all', before !== undefined && after !== undefined && 'text-red-700 line-through decoration-red-700/40 dark:text-red-400')}>{before === undefined ? <span className="text-muted-foreground">—</span> : displayValue(before)}</td>
                  <td className={cn('px-3 py-2 font-mono text-xs break-all', before !== undefined && after !== undefined && 'text-emerald-700 dark:text-emerald-400')}>{after === undefined ? <span className="text-muted-foreground">—</span> : displayValue(after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <div><dt className="inline">Audit ID: </dt><dd className="inline font-mono select-all">{entry.auditId}</dd></div>
        <div><dt className="inline">Recorded: </dt><dd className="inline font-mono">{entry.changedAt}</dd></div>
      </dl>
    </div>
  )
}
