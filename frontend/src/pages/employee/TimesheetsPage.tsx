import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Plus, Save, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { employeeApi } from '@/lib/employee/api'
import { addDays, entryHours, formatDate, formatHours, fromISODate, minutesOf, startOfWeek, toISODate } from '@/lib/employee/dates'
import { CURRENT_EMPLOYEE_ID } from '@/lib/employee/session'
import type { NewTimesheetEntry, PayPeriod, Project, TimesheetEntry } from '@/lib/employee/types'
import { cn } from '@/lib/utils'

/** A row on the board: either persisted (has saved) or a local draft. */
type Row = NewTimesheetEntry & { key: string; saved?: TimesheetEntry }
type Draft = NewTimesheetEntry & { draftId: string }
type Editing = { date: string; row?: Row } | null

const EMP = CURRENT_EMPLOYEE_ID
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** True when an arrow key on this element already means something (text fields, menus, dialogs, tabs). */
function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true
  return !!target.closest('[role="dialog"], [role="listbox"], [role="menu"], [role="tablist"], [role="slider"]')
}

/** Calendar weeks (Mon–Sun) covering the period; days outside it are null. */
function periodWeeks(period: PayPeriod): (Date | null)[][] {
  const start = fromISODate(period.start)
  const end = fromISODate(period.end)
  const weeks: (Date | null)[][] = []
  for (let monday = startOfWeek(start); monday <= end; monday = addDays(monday, 7))
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i)
      return d < start || d > end ? null : d
    }))
  return weeks
}

export default function TimesheetsPage() {
  /** Which period to show: undefined = current (as the API defines it), else any date inside it. */
  const [periodDate, setPeriodDate] = useState<string | undefined>(undefined)
  const [period, setPeriod] = useState<PayPeriod | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [saved, setSaved] = useState<TimesheetEntry[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)

  const dirty = drafts.length + pendingDeletes.size
  const projectName = useCallback((code: string) => projects.find((p) => p.projectCode === code)?.name ?? code, [projects])

  useEffect(() => {
    employeeApi.getProjects(EMP).then(setProjects).catch((e) => toast.error(`Couldn't load projects: ${e.message}`))
  }, [])

  // The backend decides the period boundaries and whether it's open for changes.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    employeeApi
      .getPayPeriod(EMP, periodDate)
      .then(async (p) => {
        const entries = await employeeApi.getTimesheets(EMP, p.start, p.end)
        if (cancelled) return
        setPeriod(p)
        setSaved(entries)
      })
      .catch((e) => toast.error(`Couldn't load timesheets: ${e.message}`))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [periodDate])

  const rows: Row[] = useMemo(
    () =>
      [
        ...saved.filter((s) => !pendingDeletes.has(s.timesheetId)).map((s) => ({ ...s, key: s.timesheetId, saved: s })),
        ...drafts.map((d) => ({ ...d, key: d.draftId })),
      ].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    [saved, drafts, pendingDeletes],
  )
  const weeks = useMemo(() => (period ? periodWeeks(period) : []), [period])

  const submitted = saved.length > 0 && saved.every((s) => s.submitted)
  const approved = submitted && saved.every((s) => s.approved)
  const closed = !!period && !period.editable
  const locked = closed || submitted
  const totalHours = rows.reduce((n, r) => n + entryHours(r), 0)

  const goTo = (date: string | undefined) => {
    if (dirty && !window.confirm('You have unsaved changes in this pay period. Discard them?')) return
    setDrafts([])
    setPendingDeletes(new Set())
    setPeriodDate(date)
  }

  const canGoPrev = !!period && !loading
  const canGoNext = !!period && !loading && !period.isCurrent
  const goPrev = () => period && goTo(toISODate(addDays(fromISODate(period.start), -1)))
  const goNext = () => period && goTo(toISODate(addDays(fromISODate(period.end), 1)))

  // ← / → step through pay periods, except while typing, in a dialog or menu, or with a modifier held.
  // No dependency list on purpose: it re-subscribes each render so the handler never sees stale state.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (editing || confirmSubmit || isInteractiveTarget(e.target)) return
      if (e.key === 'ArrowLeft' && canGoPrev) {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const removeRow = (row: Row) => {
    if (row.saved) setPendingDeletes((s) => new Set(s).add(row.saved!.timesheetId))
    else setDrafts((d) => d.filter((x) => x.draftId !== row.key))
  }

  const upsertRow = (value: NewTimesheetEntry, original?: Row) => {
    // The API has no update: editing a saved entry deletes it and creates a new one on save.
    if (original) removeRow(original)
    setDrafts((d) => [...d, { ...value, draftId: crypto.randomUUID() }])
    setEditing(null)
  }

  async function save(): Promise<TimesheetEntry[] | null> {
    try {
      for (const id of pendingDeletes) await employeeApi.deleteTimesheet(EMP, id)
      const created = drafts.length
        ? await employeeApi.createTimesheets(EMP, drafts.map(({ date, startTime, endTime, projectCode }) => ({ date, startTime, endTime, projectCode })))
        : []
      const next = [...saved.filter((s) => !pendingDeletes.has(s.timesheetId)), ...created]
      setSaved(next)
      setDrafts([])
      setPendingDeletes(new Set())
      return next
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`)
      return null
    }
  }

  async function onSave() {
    setBusy('save')
    if (await save()) toast.success('Timesheet saved')
    setBusy(null)
  }

  async function onSubmit() {
    if (!period) return
    setBusy('submit')
    setConfirmSubmit(false)
    const current = dirty ? await save() : saved
    if (current) {
      try {
        setSaved(await employeeApi.submitTimesheets(EMP, period.start, period.end))
        toast.success('Timesheet submitted for approval')
      } catch (e) {
        toast.error(`Submit failed: ${(e as Error).message}`)
      }
    }
    setBusy(null)
  }

  if (!period) {
    return (
      <div className="mx-auto grid max-w-7xl gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const periodLabel = `${formatDate(period.start, { month: 'short', day: 'numeric' })} – ${formatDate(period.end)}`
  const today = toISODate(new Date())

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Timesheets" description="Log your hours by project for the current pay period. Save as you go, then submit for approval.">
        <Button variant="outline" onClick={onSave} disabled={locked || !dirty || busy !== null}>
          <Save />
          {busy === 'save' ? 'Saving…' : dirty ? `Save (${dirty})` : 'Saved'}
        </Button>
        <Button onClick={() => setConfirmSubmit(true)} disabled={locked || rows.length === 0 || busy !== null}>
          <Send />
          {busy === 'submit' ? 'Submitting…' : 'Submit pay period'}
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous pay period" aria-keyshortcuts="ArrowLeft"
            title="Previous pay period (←)" disabled={!canGoPrev} onClick={goPrev}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next pay period" aria-keyshortcuts="ArrowRight"
            title="Next pay period (→)" disabled={!canGoNext} onClick={goNext}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" disabled={period.isCurrent} onClick={() => goTo(undefined)}>Current period</Button>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground lg:flex" aria-hidden>
            <kbd className="rounded border bg-muted px-1.5 font-sans">←</kbd>
            <kbd className="rounded border bg-muted px-1.5 font-sans">→</kbd>
            to switch periods
          </span>
        </div>
        <div>
          <div className="font-medium">{periodLabel}</div>
          <div className="text-xs text-muted-foreground">Pay date {formatDate(period.payDate)}</div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {approved ? (
            <Badge className="gap-1"><CheckCircle2 className="size-3" />Approved</Badge>
          ) : submitted ? (
            <Badge variant="secondary" className="gap-1"><Lock className="size-3" />Submitted · awaiting approval</Badge>
          ) : closed ? (
            <Badge variant="secondary" className="gap-1"><Lock className="size-3" />Closed</Badge>
          ) : dirty ? (
            <Badge variant="outline">Unsaved changes</Badge>
          ) : (
            <Badge variant="outline">Open</Badge>
          )}
          <span className="text-muted-foreground">
            Total <span className="font-semibold text-foreground tabular-nums">{formatHours(totalHours)}</span>
          </span>
        </div>
      </div>

      {closed && !submitted && (
        <p className="mb-4 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This pay period is closed, so its time can't be changed. You can only edit the current pay period.
        </p>
      )}

      {/* Pay period board: calendar weeks, days outside the period greyed out */}
      <div className={cn('grid gap-2', loading && 'opacity-60')}>
        <div className="hidden grid-cols-7 gap-2 px-1 text-xs uppercase text-muted-foreground md:grid">
          {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid gap-2 md:grid-cols-7">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="hidden rounded-lg border border-dashed bg-muted/20 md:block" aria-hidden />
              const iso = toISODate(day)
              const dayRows = rows.filter((r) => r.date === iso)
              const hours = dayRows.reduce((n, r) => n + entryHours(r), 0)
              const weekend = day.getDay() % 6 === 0
              return (
                <div key={iso} className={cn('flex min-h-40 flex-col rounded-lg border bg-card', weekend && 'bg-muted/40')}>
                  <div className="flex items-baseline justify-between border-b px-3 py-1.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className={cn('text-base font-semibold', iso === today && 'text-primary')}>{day.getDate()}</span>
                      <span className="text-xs text-muted-foreground md:hidden">{day.toLocaleDateString('en-CA', { weekday: 'short', month: 'short' })}</span>
                      {day.getDate() === 1 || iso === period.start ? (
                        <span className="hidden text-xs text-muted-foreground md:inline">{day.toLocaleDateString('en-CA', { month: 'short' })}</span>
                      ) : null}
                    </div>
                    <span className={cn('text-xs tabular-nums', hours ? 'font-medium' : 'text-muted-foreground')}>{formatHours(hours)}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                    {dayRows.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        disabled={locked}
                        onClick={() => setEditing({ date: iso, row: r })}
                        className={cn(
                          'rounded-md border border-l-4 border-l-primary bg-background px-2 py-1 text-left text-xs transition-colors',
                          !locked && 'hover:bg-muted',
                          !r.saved && 'border-dashed',
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold">{r.projectCode}</span>
                          <span className="tabular-nums">{formatHours(entryHours(r))}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground tabular-nums">
                          {r.startTime}–{r.endTime}
                          {!r.saved && <span className="text-[10px] font-medium uppercase text-primary">Unsaved</span>}
                        </div>
                      </button>
                    ))}
                    {!locked && (
                      <Button variant="ghost" size="xs" className="mt-auto w-full justify-start text-muted-foreground" onClick={() => setEditing({ date: iso })}>
                        <Plus />
                        Log time
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Pay period summary by project</CardTitle>
        </CardHeader>
        <CardContent>
          <SummaryTable rows={rows} weeks={weeks} projectName={projectName} />
        </CardContent>
      </Card>

      <EntryDialog
        editing={editing}
        projects={projects}
        rows={rows}
        minDate={period.start}
        maxDate={period.end}
        onClose={() => setEditing(null)}
        onSave={upsertRow}
        onDelete={(r) => {
          removeRow(r)
          setEditing(null)
        }}
      />

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit pay period {periodLabel}?</DialogTitle>
            <DialogDescription>
              You're submitting {formatHours(totalHours)} across {rows.length} {rows.length === 1 ? 'entry' : 'entries'}.
              {dirty > 0 && ' Unsaved changes will be saved first.'} You can't edit or delete entries after submitting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmit(false)}>Cancel</Button>
            <Button onClick={onSubmit}><Send />Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Project × week totals (a per-day table would be 16 columns wide). */
function SummaryTable({ rows, weeks, projectName }: { rows: Row[]; weeks: (Date | null)[][]; projectName: (c: string) => string }) {
  const codes = [...new Set(rows.map((r) => r.projectCode))].sort()
  const ranges = weeks.map((w) => {
    const days = w.filter((d): d is Date => d !== null).map(toISODate)
    return { from: days[0], to: days.at(-1)! }
  })
  const hours = (code: string | null, range: { from: string; to: string } | null) =>
    rows
      .filter((r) => (code === null || r.projectCode === code) && (!range || (r.date >= range.from && r.date <= range.to)))
      .reduce((n, r) => n + entryHours(r), 0)
  const show = (h: number) => (h ? formatHours(h) : <span className="text-muted-foreground">–</span>)
  const label = (r: { from: string; to: string }) =>
    r.from === r.to ? formatDate(r.from, { month: 'short', day: 'numeric' }) : `${formatDate(r.from, { month: 'short', day: 'numeric' })} – ${formatDate(r.to, { day: 'numeric' })}`
  if (!codes.length) return <p className="text-sm text-muted-foreground">No time logged in this pay period yet.</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          {ranges.map((r) => <TableHead key={r.from} className="text-right">{label(r)}</TableHead>)}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {codes.map((code) => (
          <TableRow key={code}>
            <TableCell>
              <span className="font-medium">{code}</span> <span className="text-muted-foreground">{projectName(code)}</span>
            </TableCell>
            {ranges.map((r) => <TableCell key={r.from} className="text-right tabular-nums">{show(hours(code, r))}</TableCell>)}
            <TableCell className="text-right font-medium tabular-nums">{show(hours(code, null))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          {ranges.map((r) => <TableCell key={r.from} className="text-right tabular-nums">{show(hours(null, r))}</TableCell>)}
          <TableCell className="text-right tabular-nums">{show(hours(null, null))}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function EntryDialog({
  editing, projects, rows, minDate, maxDate, onClose, onSave, onDelete,
}: {
  editing: Editing
  projects: Project[]
  rows: Row[]
  minDate: string
  maxDate: string
  onClose: () => void
  onSave: (value: NewTimesheetEntry, original?: Row) => void
  onDelete: (row: Row) => void
}) {
  const [form, setForm] = useState<NewTimesheetEntry>({ date: '', startTime: '09:00', endTime: '17:00', projectCode: '' })

  useEffect(() => {
    if (!editing) return
    if (editing.row) {
      const { date, startTime, endTime, projectCode } = editing.row
      setForm({ date, startTime, endTime, projectCode })
    } else {
      // Start right after the last entry of the day, or 9:00.
      const last = rows.filter((r) => r.date === editing.date).at(-1)
      const start = last ? last.endTime : '09:00'
      const endMin = Math.min(minutesOf(start) + 60, 23 * 60 + 45)
      const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
      setForm({ date: editing.date, startTime: start, endTime: last ? end : '17:00', projectCode: last?.projectCode ?? '' })
    }
  }, [editing, rows])

  const hours = entryHours(form)
  const overlap = rows.find(
    (r) => r.key !== editing?.row?.key && r.date === form.date &&
      minutesOf(form.startTime) < minutesOf(r.endTime) && minutesOf(r.startTime) < minutesOf(form.endTime),
  )
  const error = !form.projectCode
    ? 'Choose a project.'
    : !form.date || form.date < minDate || form.date > maxDate
      ? 'Date must be within this pay period.'
      : hours <= 0
        ? 'End time must be after start time.'
        : overlap
          ? `Overlaps ${overlap.projectCode} ${overlap.startTime}–${overlap.endTime}.`
          : null

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing?.row ? 'Edit time entry' : 'Log time'}</DialogTitle>
          <DialogDescription>
            {form.date && fromISODate(form.date).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!error) onSave(form, editing?.row)
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="project">Project</Label>
            <Select value={form.projectCode} onValueChange={(projectCode) => setForm({ ...form, projectCode })}>
              <SelectTrigger id="project" className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.projectCode} value={p.projectCode}>
                    <span className="font-medium">{p.projectCode}</span>
                    <span className="text-muted-foreground">{p.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" min={minDate} max={maxDate} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="time" step={900} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="end">End</Label>
              <Input id="end" type="time" step={900} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium tabular-nums">{formatHours(hours)}</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {editing?.row ? (
              <Button type="button" variant="destructive" onClick={() => onDelete(editing.row!)}>
                <Trash2 />Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={!!error}>{editing?.row ? 'Update' : 'Add entry'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
