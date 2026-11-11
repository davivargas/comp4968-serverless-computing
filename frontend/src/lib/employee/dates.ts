import type { ClockTime, ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Parse YYYY-MM-DD as a local date (new Date('2026-01-01') would be UTC). */
export const fromISODate = (s: ISODate) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Monday of the week containing d. */
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))

export const weekDays = (monday: Date) => Array.from({ length: 7 }, (_, i) => addDays(monday, i))

export const minutesOf = (t: ClockTime) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const entryHours = (e: { startTime: ClockTime; endTime: ClockTime }) =>
  Math.max(0, minutesOf(e.endTime) - minutesOf(e.startTime)) / 60

export const formatHours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')}h`

export const formatDate = (s: ISODate, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  fromISODate(s).toLocaleDateString('en-CA', opts)

export const formatMoney = (n: number) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' })

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

