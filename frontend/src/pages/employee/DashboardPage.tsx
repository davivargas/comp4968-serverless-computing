import { ArrowRight } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Label as ChartLabel, Pie, PieChart } from 'recharts'
import { useEmployeeId } from '@/components/auth/session-context'
import PageHeader from '@/components/PageHeader'
import LoadError from '@/components/LoadError'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { employeeApi } from '@/lib/employee/api'
import { formatDate, formatHours, formatMoney, MONTHS, toISODate } from '@/lib/employee/dates'
import { PAY_SLICES, totalDeductions } from '@/lib/employee/pay'
import type { AggregatePay, Granularity, PayStubSummary } from '@/lib/employee/types'

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR, THIS_YEAR - 1]

const chartConfig = Object.fromEntries(
  PAY_SLICES.map((s) => [s.key, { label: s.label, theme: { light: s.color, dark: s.dark } }]),
) satisfies ChartConfig

export default function DashboardPage() {
  const employeeId = useEmployeeId()
  const [year, setYear] = useState(THIS_YEAR)
  const [granularity, setGranularity] = useState<Granularity>('ytd')
  const [periodLabel, setPeriodLabel] = useState<string>('')
  const [data, setData] = useState<AggregatePay | null>(null)
  const [recent, setRecent] = useState<PayStubSummary[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0) // bumped by "Try again"
  const dark = useTheme().resolvedTheme === 'dark'

  useEffect(() => {
    let cancelled = false
    setData(null)
    setLoadError(null)
    employeeApi
      .getAggregatePay(employeeId, year, granularity)
      .then((d) => {
        if (cancelled) return
        setData(d)
        // Default to the most recent period that has pay.
        setPeriodLabel((cur) => (d.periods.some((p) => p.label === cur) ? cur : d.periods.at(-1)?.label ?? ''))
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message))
    return () => {
      cancelled = true
    }
  }, [employeeId, year, granularity, attempt])

  useEffect(() => {
    const today = new Date()
    employeeApi
      .getPayStubs(employeeId, toISODate(new Date(today.getFullYear(), today.getMonth() - 3, 1)), toISODate(today))
      .then((s) => setRecent(s.slice(0, 4)))
      .catch(() => {})
  }, [employeeId])

  const period = data?.periods.find((p) => p.label === periodLabel) ?? data?.periods.at(-1)
  const periodOptions =
    granularity === 'quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] : granularity === 'monthly' ? MONTHS : []

  const slices = useMemo(
    () =>
      period
        ? PAY_SLICES.map((s) => ({ ...s, color: dark ? s.dark : s.color, value: s.key === 'net' ? period.net : period.deductions[s.key] }))
        : [],
    [period, dark],
  )
  const deductions = period ? totalDeductions(period.deductions) : 0

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Pay dashboard" description="Your earnings, taxes and deductions." />

      {/* Filters: one row above the charts */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28" aria-label="Year"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Tabs value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
          <TabsList>
            <TabsTrigger value="ytd">Year to date</TabsTrigger>
            <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
        </Tabs>
        {granularity !== 'ytd' && (
          <Select value={period?.label ?? ''} onValueChange={setPeriodLabel}>
            <SelectTrigger className="w-32" aria-label={granularity === 'quarterly' ? 'Quarter' : 'Month'}><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {periodOptions.map((label) => (
                <SelectItem key={label} value={label} disabled={!data?.periods.some((p) => p.label === label)}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {period && (
          <span className="text-sm text-muted-foreground">{formatDate(period.start)} – {formatDate(period.end)}</span>
        )}
      </div>

      {loadError ? (
        <LoadError title="Couldn't load your pay summary" message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      ) : !data ? (
        <div className="grid gap-4"><Skeleton className="h-24" /><Skeleton className="h-80" /></div>
      ) : !period ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No pay recorded for {year}.</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Gross pay" value={formatMoney(period.gross)} />
            <Stat label="Net pay" value={formatMoney(period.net)} />
            <Stat label="Taxes & deductions" value={formatMoney(deductions)} hint={`${((deductions / period.gross) * 100).toFixed(1)}% of gross`} />
            <Stat label="Hours paid" value={formatHours(period.hours)} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Where your pay went</CardTitle>
                <CardDescription>Gross pay split into net pay, taxes and deductions</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-72">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel formatter={(v, name) => (
                      <div className="flex w-full items-center gap-2">
                        <span className="size-2.5 rounded-[2px]" style={{ background: slices.find((s) => s.key === name)?.color }} />
                        <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label}</span>
                        <span className="ml-auto font-medium tabular-nums">{formatMoney(Number(v))}</span>
                      </div>
                    )} />} />
                    <Pie data={slices} dataKey="value" nameKey="key" innerRadius="58%" outerRadius="92%" stroke="var(--card)" strokeWidth={2} paddingAngle={0}>
                      {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
                      <ChartLabel
                        content={({ viewBox }) => {
                          if (!viewBox || !('cx' in viewBox)) return null
                          return (
                            <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                              <tspan x={viewBox.cx} dy="-0.4em" className="fill-foreground text-xl font-semibold">{formatMoney(period.gross)}</tspan>
                              <tspan x={viewBox.cx} dy="1.6em" className="fill-muted-foreground text-xs">Gross pay</tspan>
                            </text>
                          )
                        }}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="mt-4 grid gap-1.5 text-sm">
                  {slices.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span className="size-3 rounded-[3px]" style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">{((s.value / period.gross) * 100).toFixed(1)}%</span>
                      <span className="w-24 text-right font-medium tabular-nums">{formatMoney(s.value)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">{year} by {granularity === 'quarterly' ? 'quarter' : 'month'}</CardTitle>
                <CardDescription>{granularity === 'ytd' ? 'Monthly breakdown of the year so far' : 'Select a row to see it in the chart'}</CardDescription>
              </CardHeader>
              <CardContent>
                <BreakdownTable data={data} selected={period.label} onSelect={granularity === 'ytd' ? undefined : setPeriodLabel} year={year} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Recent pay stubs</CardTitle>
          <CardAction>
            <Button asChild variant="ghost" size="sm"><Link to="/employee/paystubs">View all<ArrowRight /></Link></Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {recent.map((s) => (
            <Link key={s.payDate} to={`/employee/paystubs?view=${s.payDate}`} className="rounded-lg border p-3 transition-colors hover:border-primary">
              <div className="text-xs text-muted-foreground">{formatDate(s.payDate)}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(s.net)}</div>
              <div className="text-xs text-muted-foreground">{formatHours(s.hours)} · gross {formatMoney(s.gross)}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

/** For YTD the table fetches monthly rows so there's still a breakdown to read. */
function BreakdownTable({ data, selected, onSelect, year }: { data: AggregatePay; selected: string; onSelect?: (l: string) => void; year: number }) {
  const employeeId = useEmployeeId()
  const [monthly, setMonthly] = useState<AggregatePay | null>(null)
  useEffect(() => {
    if (data.granularity === 'ytd') employeeApi.getAggregatePay(employeeId, year, 'monthly').then(setMonthly).catch(() => {})
  }, [employeeId, data.granularity, year])
  const rows = data.granularity === 'ytd' ? monthly?.periods ?? [] : data.periods
  const sum = (f: (p: (typeof rows)[number]) => number) => rows.reduce((n, p) => n + f(p), 0)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead className="text-right">Hours</TableHead>
          <TableHead className="text-right">Gross</TableHead>
          <TableHead className="text-right">Deductions</TableHead>
          <TableHead className="text-right">Net</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow
            key={p.label}
            data-state={onSelect && p.label === selected ? 'selected' : undefined}
            className={onSelect ? 'cursor-pointer' : undefined}
            onClick={() => onSelect?.(p.label)}
          >
            <TableCell className="font-medium">{p.label}</TableCell>
            <TableCell className="text-right tabular-nums">{formatHours(p.hours)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(p.gross)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(totalDeductions(p.deductions))}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(p.net)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">{formatHours(sum((p) => p.hours))}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(sum((p) => p.gross))}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(sum((p) => totalDeductions(p.deductions)))}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(sum((p) => p.net))}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
