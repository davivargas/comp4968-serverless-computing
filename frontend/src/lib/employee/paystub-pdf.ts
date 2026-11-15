// Loaded on demand (see PayStubsPage) so jsPDF stays out of the main bundle.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatMoney } from './dates'
import { breakdownRows, DEDUCTION_LABELS, earningLabel, totalDeductions, vacationPercent } from './pay'
import type { Deductions, PayStub } from './types'

export function downloadPayStubPdf(stub: PayStub) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const x = 48
  const right = doc.internal.pageSize.getWidth() - 48

  doc.setFont('helvetica', 'bold').setFontSize(18).text('Pay Statement', x, 60)

  doc.setFont('helvetica', 'normal').setTextColor(0).setFontSize(10)
  const meta: [string, string][] = [
    ['Employee', `${stub.employeeName} (${stub.employeeId})`],
    ['Position', stub.position],
    ['Pay date', formatDate(stub.payDate)],
    ['Pay period', `${formatDate(stub.periodStart)} – ${formatDate(stub.periodEnd)}`],
    // jsPDF throws on a null string, and there's no account when direct deposit isn't set up.
    ['Deposited to', stub.depositAccount ?? 'No direct deposit on file'],
  ]
  meta.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold').text(k, x, 92 + i * 15)
    doc.setFont('helvetica', 'normal').text(v, x + 90, 92 + i * 15)
  })

  doc.setFont('helvetica', 'bold').setFontSize(10).text('Net pay', right, 92, { align: 'right' })
  doc.setFontSize(20).text(formatMoney(stub.net), right, 116, { align: 'right' })

  const head = { fillColor: [8, 145, 178] as [number, number, number], textColor: 255 }
  // columnStyles only reaches body rows, so line up the headers and totals with the numbers.
  const alignFoot = ({ section, column, cell }: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
    if (section !== 'body' && column.index > 0) cell.styles.halign = 'right'
  }
  autoTable(doc, {
    startY: 180,
    head: [['Earnings', 'Hours', 'Rate', 'Current']],
    body: stub.earnings.map((e) => {
      const pct = vacationPercent(e, stub.earnings)
      return [earningLabel(e), pct ? '—' : e.hours.toFixed(2), pct ?? formatMoney(e.rate), formatMoney(e.amount)]
    }),
    foot: [
      ['Gross pay', stub.hours.toFixed(2), '', formatMoney(stub.gross)],
      ['Year to date', stub.ytd.hours.toFixed(2), '', formatMoney(stub.ytd.gross)],
    ],
    headStyles: head,
    footStyles: { fillColor: [245, 245, 245], textColor: 0 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: alignFoot,
    margin: { left: x, right: 48 },
  })

  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const breakdown = breakdownRows(stub.hoursBreakdown)
  if (breakdown.length) {
    autoTable(doc, {
      startY: lastY() + 20,
      head: [['Hours by type', 'Hours', 'Pay']],
      body: breakdown.map((r) => [r.label, r.hours.toFixed(2), r.pay === null ? '—' : formatMoney(r.pay)]),
      headStyles: head,
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: alignFoot,
      margin: { left: x, right: 48 },
    })
  }

  const keys = Object.keys(DEDUCTION_LABELS) as (keyof Deductions)[]
  autoTable(doc, {
    startY: lastY() + 20,
    head: [['Deductions', 'Current', 'Year to date']],
    body: keys.map((k) => [DEDUCTION_LABELS[k], formatMoney(stub.deductions[k]), formatMoney(stub.ytd.deductions[k])]),
    foot: [
      ['Total deductions', formatMoney(totalDeductions(stub.deductions)), formatMoney(totalDeductions(stub.ytd.deductions))],
      ['Net pay', formatMoney(stub.net), formatMoney(stub.ytd.net)],
    ],
    headStyles: head,
    footStyles: { fillColor: [245, 245, 245], textColor: 0 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: alignFoot,
    margin: { left: x, right: 48 },
  })

  doc.save(`paystub-${stub.employeeId}-${stub.payDate}.pdf`)
}
