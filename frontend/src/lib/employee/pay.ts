import type { Deductions, HoursBreakdown, PayStubLine } from './types'

export type PaySlice = 'net' | keyof Deductions

/**
 * Pie slices in fixed order. Colours are ordered so neighbouring slices (incl. last→first)
 * stay distinguishable under colour-blindness; slices are also labelled and listed in a legend.
 * `dark` is a separate set validated against the dark card surface, not an automatic flip.
 */
export const PAY_SLICES: { key: PaySlice; label: string; color: string; dark: string }[] = [
  { key: 'net', label: 'Net pay', color: '#16a34a', dark: '#16a34a' },
  { key: 'cpp', label: 'CPP', color: '#7c3aed', dark: '#8b5cf6' },
  { key: 'federalTax', label: 'Federal tax', color: '#dc2626', dark: '#ef4444' },
  { key: 'provincialTax', label: 'Provincial tax', color: '#2563eb', dark: '#3b82f6' },
  { key: 'ei', label: 'EI', color: '#d97706', dark: '#d97706' },
]

export const DEDUCTION_LABELS: Record<keyof Deductions, string> = {
  federalTax: 'Federal income tax',
  provincialTax: 'Provincial income tax',
  cpp: 'CPP contributions',
  ei: 'EI premiums',
}

export const totalDeductions = (d: Deductions) => d.federalTax + d.provincialTax + d.cpp + d.ei

/** The backend's fixed system project codes; pay stub lines only carry the code. */
const SYSTEM_PROJECT_NAMES: Record<string, string> = { '9001': 'Sick day', '9002': 'Vacation day', '9003': 'Miscellaneous' }

/** How an earnings line reads on a pay stub. A project can have both a project line and an overtime line. */
export function earningLabel(line: PayStubLine): string {
  const code = line.projectCode === null || line.projectCode === undefined ? '' : String(line.projectCode)
  if (line.lineType === 'OVERTIME_PREMIUM') return code ? `Overtime premium · ${code}` : 'Overtime premium'
  if (line.lineType === 'WEEKEND_PREMIUM') return 'Weekend premium'
  if (line.lineType === 'STAT_PREMIUM') return 'Stat holiday premium'
  if (line.lineType === 'SICK') return 'Sick pay'
  if (line.lineType === 'VACATION') return 'Vacation pay'
  return SYSTEM_PROJECT_NAMES[code] ?? (code || 'Project')
}

export interface BreakdownRow {
  label: string
  hours: number
  /** Null for vacation leave, which is recorded but unpaid. */
  pay: number | null
}

/** The stub's hours by kind, skipping kinds with no hours and no pay. Empty when the stub has no breakdown. */
export function breakdownRows(b: HoursBreakdown | undefined): BreakdownRow[] {
  if (!b) return []
  const rows: BreakdownRow[] = [
    { label: 'Regular', ...b.regular },
    { label: 'Overtime (1.5x)', ...b.overtime },
    { label: 'Double overtime (2x)', ...b.doubleOvertime },
    { label: 'Weekend (1.5x)', ...b.weekend },
    { label: 'Stat holiday (1.5x)', ...b.statHoliday },
    { label: 'Sick', ...b.sick },
    { label: 'Vacation leave (unpaid)', hours: b.vacationLeaveHours, pay: null },
  ]
  return rows.filter((r) => r.hours || r.pay)
}

/**
 * Vacation pay is a percentage of the period's wages (4%, or 6% after five years), not hours, so the
 * backend stores it with 0 hours and a $0 rate. Returns the percentage it works out to ("4%"), or null
 * for any other line. Callers show it in the Rate column and a dash for hours.
 */
export function vacationPercent(line: PayStubLine, lines: PayStubLine[]): string | null {
  if (line.lineType !== 'VACATION') return null
  const wages = lines.filter((l) => l.lineType !== 'VACATION').reduce((sum, l) => sum + l.amount, 0)
  return wages > 0 ? `${Math.round((line.amount / wages) * 100)}%` : '—'
}
