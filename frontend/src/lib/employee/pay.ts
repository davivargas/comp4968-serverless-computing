import type { Deductions, PayStubLine } from './types'

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

/** How an earnings line reads on a pay stub. A project can have both a project line and an overtime line. */
export function earningLabel(line: PayStubLine): string {
  const code = line.projectCode === null || line.projectCode === undefined ? '' : String(line.projectCode)
  if (line.lineType === 'OVERTIME_PREMIUM') return code ? `Overtime premium · ${code}` : 'Overtime premium'
  if (line.lineType === 'VACATION') return 'Vacation pay'
  return code || 'Project'
}
