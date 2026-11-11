import { Download, Eye } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { employeeApi } from '@/lib/employee/api'
import { formatDate, formatHours, formatMoney, toISODate } from '@/lib/employee/dates'
import { DEDUCTION_LABELS, totalDeductions } from '@/lib/employee/pay'
import { CURRENT_EMPLOYEE_ID } from '@/lib/employee/session'
import type { Deductions, PayStub, PayStubSummary } from '@/lib/employee/types'

/** Fixed pay dates (1st and 15th) from Jan 1 last year up to today, newest first. */
function payDateOptions() {
  const today = new Date()
  const out: string[] = []
  for (let y = today.getFullYear() - 1; y <= today.getFullYear(); y++)
    for (let m = 0; m < 12; m++)
      for (const d of [1, 15]) {
        const date = new Date(y, m, d)
        if (date <= today) out.push(toISODate(date))
      }
  return out.reverse()
}

export default function PayStubsPage() {
  const options = useMemo(payDateOptions, [])
  const [params, setParams] = useSearchParams()
  const [from, setFrom] = useState(options[Math.min(11, options.length - 1)])
  const [to, setTo] = useState(options[0])
  const [stubs, setStubs] = useState<PayStubSummary[] | null>(null)
  const [viewing, setViewing] = useState<PayStub | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    setStubs(null)
    employeeApi.getPayStubs(CURRENT_EMPLOYEE_ID, from, to).then(setStubs).catch((e) => toast.error(`Couldn't load pay stubs: ${e.message}`))
  }, [from, to])

  // Deep link from the dashboard: /employee/paystubs?view=2026-11-01
  const viewParam = params.get('view')
  useEffect(() => {
    if (!viewParam) return
    employeeApi.getPayStub(CURRENT_EMPLOYEE_ID, viewParam).then(setViewing).catch((e) => toast.error(e.message))
  }, [viewParam])

  const closeView = () => {
    setViewing(null)
    if (viewParam) setParams({}, { replace: true })
  }

  async function download(payDate: string) {
    setDownloading(payDate)
    try {
      const [{ downloadPayStubPdf }, stub] = await Promise.all([
        import('@/lib/employee/paystub-pdf'),
        viewing?.payDate === payDate ? viewing : employeeApi.getPayStub(CURRENT_EMPLOYEE_ID, payDate),
      ])
      downloadPayStubPdf(stub)
    } catch (e) {
      toast.error(`Download failed: ${(e as Error).message}`)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Pay stubs" description="View and download your pay statements. Pay dates fall on the 1st and 15th." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="from" className="text-xs text-muted-foreground">From pay date</Label>
          <DateSelect id="from" options={options} value={from} onChange={setFrom} disable={(d) => d > to} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to" className="text-xs text-muted-foreground">To pay date</Label>
          <DateSelect id="to" options={options} value={to} onChange={setTo} disable={(d) => d < from} />
        </div>
      </div>

      <Card>
        <CardContent>
          {!stubs ? (
            <div className="grid gap-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : stubs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No pay stubs in this range.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pay date</TableHead>
                  <TableHead>Pay period</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {stubs.map((s) => (
                  <TableRow key={s.payDate}>
                    <TableCell className="font-medium">{formatDate(s.payDate)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(s.periodStart, { month: 'short', day: 'numeric' })} – {formatDate(s.periodEnd, { month: 'short', day: 'numeric' })}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(s.hours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(s.gross)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(s.net)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setParams({ view: s.payDate })}><Eye />View</Button>
                        <Button variant="outline" size="sm" disabled={downloading === s.payDate} onClick={() => download(s.payDate)}><Download />PDF</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && closeView()}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          {viewing && <StubDetail stub={viewing} />}
          <DialogFooter>
            <Button variant="outline" onClick={closeView}>Close</Button>
            {viewing && <Button onClick={() => download(viewing.payDate)}><Download />Download PDF</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DateSelect({ id, value, options, onChange, disable }: { id: string; value: string; options: string[]; onChange: (v: string) => void; disable: (d: string) => boolean }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((d) => <SelectItem key={d} value={d} disabled={disable(d)}>{formatDate(d)}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function StubDetail({ stub }: { stub: PayStub }) {
  const keys = Object.keys(DEDUCTION_LABELS) as (keyof Deductions)[]
  return (
    <>
      <DialogHeader>
        <DialogTitle>Pay statement · {formatDate(stub.payDate)}</DialogTitle>
        <DialogDescription>
          Period {formatDate(stub.periodStart)} – {formatDate(stub.periodEnd)} · deposited to {stub.depositAccount}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
        <SummaryFigure label="Gross" value={formatMoney(stub.gross)} ytd={formatMoney(stub.ytd.gross)} />
        <SummaryFigure label="Deductions" value={formatMoney(totalDeductions(stub.deductions))} ytd={formatMoney(totalDeductions(stub.ytd.deductions))} />
        <SummaryFigure label="Net pay" value={formatMoney(stub.net)} ytd={formatMoney(stub.ytd.net)} highlight />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Earnings</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stub.earnings.map((e) => (
            <TableRow key={e.projectCode}>
              <TableCell>{e.projectCode}</TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(e.hours)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(e.rate)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(e.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Gross pay</TableCell>
            <TableCell className="text-right tabular-nums">{formatHours(stub.hours)}</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">{formatMoney(stub.gross)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Year to date</TableCell>
            <TableCell className="text-right tabular-nums">{formatHours(stub.ytd.hours)}</TableCell>
            <TableCell />
            <TableCell className="text-right tabular-nums">{formatMoney(stub.ytd.gross)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <Separator />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deductions</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Year to date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k}>
              <TableCell>{DEDUCTION_LABELS[k]}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(stub.deductions[k])}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(stub.ytd.deductions[k])}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Net pay</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(stub.net)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(stub.ytd.net)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </>
  )
}

function SummaryFigure({ label, value, ytd, highlight }: { label: string; value: string; ytd: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={highlight ? 'text-lg font-semibold text-primary tabular-nums' : 'text-lg font-semibold tabular-nums'}>{value}</div>
      <div className="text-xs text-muted-foreground tabular-nums">YTD {ytd}</div>
    </div>
  )
}
