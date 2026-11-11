// In-browser stand-in for the employee API so the UI works before the backend exists.
// Timesheets and profile edits persist in localStorage; pay data is generated deterministically.
import type { EmployeeApi } from './api'
import { addDays, fromISODate, MONTHS, toISODate } from './dates'
import type {
  AggregatePay, Deductions, EmployeeProfile, ISODate, NewTimesheetEntry, PayPeriod, PayPeriodAggregate, PayStub, PayStubSummary, Project, TimesheetEntry,
} from './types'

const PROJECTS: Project[] = [
  { projectCode: 'PRJ-100', name: 'Payroll Platform' },
  { projectCode: 'PRJ-200', name: 'Mobile App' },
  { projectCode: 'PRJ-300', name: 'Data Warehouse' },
  { projectCode: 'INT-001', name: 'Internal / Meetings' },
  { projectCode: 'TRN-001', name: 'Training' },
]

const DEFAULT_PROFILE: EmployeeProfile = {
  employeeId: 'E1001',
  firstName: 'Alex',
  lastName: 'Morgan',
  email: 'alex.morgan@example.com',
  position: 'Software Developer',
  payGrade: 'P2',
  hourlyRate: 42.5,
  phone: '604-555-0142',
  address: { street: '3700 Willingdon Ave', city: 'Burnaby', province: 'BC', postalCode: 'V5G 3H2', country: 'Canada' },
  directDeposit: { institutionNumber: '004', transitNumber: '12345', accountNumber: '1234567' },
}

const TS_KEY = 'mock.timesheets'
const PROFILE_KEY = 'mock.profile'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: changes live for this page load only */
  }
}

const delay = <T>(value: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms))
const round2 = (n: number) => Math.round(n * 100) / 100
const mask = (acct: string) => `${'*'.repeat(Math.max(0, acct.length - 4))}${acct.slice(-4)}`

let timesheets: TimesheetEntry[] = load(TS_KEY, [])
let profile: EmployeeProfile = load(PROFILE_KEY, DEFAULT_PROFILE)

const publicProfile = (): EmployeeProfile => ({
  ...profile,
  directDeposit: { ...profile.directDeposit, accountNumber: mask(profile.directDeposit.accountNumber) },
})

// ---- pay generation ---------------------------------------------------------

const deductionsFor = (gross: number): Deductions => ({
  federalTax: round2(gross * 0.12),
  provincialTax: round2(gross * 0.045),
  cpp: round2(gross * 0.0595),
  ei: round2(gross * 0.0164),
})
const sumDeductions = (d: Deductions) => round2(d.federalTax + d.provincialTax + d.cpp + d.ei)
const addDeductions = (a: Deductions, b: Deductions): Deductions => ({
  federalTax: round2(a.federalTax + b.federalTax),
  provincialTax: round2(a.provincialTax + b.provincialTax),
  cpp: round2(a.cpp + b.cpp),
  ei: round2(a.ei + b.ei),
})
const ZERO: Deductions = { federalTax: 0, provincialTax: 0, cpp: 0, ei: 0 }

// ---- pay periods (the real backend owns this schedule and the edit lock) -----

/** Bi-weekly: 14 days, Monday to the Sunday two weeks later, paid on the Friday after. */
const PERIOD_ANCHOR = new Date(2025, 0, 6) // a Monday that starts a period
const PERIOD_DAYS = 14
const PAY_DELAY_DAYS = 5 // Sunday period end -> Friday pay date

interface MockPeriod {
  start: Date
  end: Date
  payDate: Date
}

function payPeriodContaining(d: Date): MockPeriod {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const daysSinceAnchor = Math.round((day.getTime() - PERIOD_ANCHOR.getTime()) / 86_400_000)
  const start = addDays(PERIOD_ANCHOR, Math.floor(daysSinceAnchor / PERIOD_DAYS) * PERIOD_DAYS)
  const end = addDays(start, PERIOD_DAYS - 1)
  return { start, end, payDate: addDays(end, PAY_DELAY_DAYS) }
}

/** Every period already paid (pay date on or before today), oldest first. */
function paidPeriods(): MockPeriod[] {
  const today = new Date()
  const periods: MockPeriod[] = []
  for (let p = payPeriodContaining(PERIOD_ANCHOR); p.payDate <= today; p = payPeriodContaining(addDays(p.end, 1))) periods.push(p)
  return periods
}

function payPeriodInfo(d: Date): PayPeriod {
  const p = payPeriodContaining(d)
  const isCurrent = p.start.getTime() === payPeriodContaining(new Date()).start.getTime()
  return { start: toISODate(p.start), end: toISODate(p.end), payDate: toISODate(p.payDate), isCurrent, editable: isCurrent }
}

const isEditableDate = (date: ISODate) => payPeriodInfo(fromISODate(date)).editable
const lockedError = (date: ISODate) => new Error(`${date} is outside the open pay period`)

// ---- pay stubs --------------------------------------------------------------

function buildStub({ start, end, payDate }: MockPeriod): PayStub {
  let weekdays = 0
  for (let d = start; d <= end; d = addDays(d, 1)) if (d.getDay() % 6 !== 0) weekdays++
  const seed = payDate.getMonth() * 31 + payDate.getDate() + payDate.getFullYear()
  const hours = weekdays * 8 - (seed % 3) * 4
  const rate = profile.hourlyRate
  const split = [0.5, 0.3, 0.2]
  const codes = [PROJECTS[seed % 3], PROJECTS[(seed + 1) % 3], PROJECTS[3]].map((p) => p.projectCode)
  const earnings = codes.map((projectCode, i) => {
    const h = i === 2 ? hours - Math.round(hours * split[0]) - Math.round(hours * split[1]) : Math.round(hours * split[i])
    return { projectCode, hours: h, rate, amount: round2(h * rate) }
  })
  const gross = round2(earnings.reduce((s, e) => s + e.amount, 0))
  const deductions = deductionsFor(gross)
  return {
    employeeId: profile.employeeId,
    employeeName: `${profile.firstName} ${profile.lastName}`,
    position: profile.position,
    payDate: toISODate(payDate),
    periodStart: toISODate(start),
    periodEnd: toISODate(end),
    hours,
    gross,
    net: round2(gross - sumDeductions(deductions)),
    earnings,
    deductions,
    ytd: { hours: 0, gross: 0, deductions: ZERO, net: 0 },
    depositAccount: mask(profile.directDeposit.accountNumber),
  }
}

function allStubs(): PayStub[] {
  const stubs = paidPeriods().map(buildStub)
  const ytd = new Map<number, PayStub['ytd']>()
  for (const s of stubs) {
    const y = fromISODate(s.payDate).getFullYear()
    const prev = ytd.get(y) ?? { hours: 0, gross: 0, deductions: ZERO, net: 0 }
    const next = { hours: prev.hours + s.hours, gross: round2(prev.gross + s.gross), deductions: addDeductions(prev.deductions, s.deductions), net: round2(prev.net + s.net) }
    ytd.set(y, next)
    s.ytd = next
  }
  return stubs
}

const summary = ({ payDate, periodStart, periodEnd, hours, gross, net }: PayStub): PayStubSummary => ({ payDate, periodStart, periodEnd, hours, gross, net })

// ---- api --------------------------------------------------------------------

export const mockApi: EmployeeApi = {
  getProjects: (_id, search) => {
    const q = search?.toLowerCase().trim()
    return delay(q ? PROJECTS.filter((p) => `${p.projectCode} ${p.name}`.toLowerCase().includes(q)) : PROJECTS)
  },

  getPayPeriod: (_id, date) => delay(payPeriodInfo(date ? fromISODate(date) : new Date())),

  getTimesheets: (id, from, to) =>
    delay(timesheets.filter((t) => t.employeeId === id && t.date >= from && t.date <= to)),

  createTimesheets: (id, entries: NewTimesheetEntry[]) => {
    const bad = entries.find((e) => !isEditableDate(e.date))
    if (bad) return Promise.reject(lockedError(bad.date))
    const created = entries.map<TimesheetEntry>((e) => ({ ...e, timesheetId: crypto.randomUUID(), employeeId: id, submitted: false, approved: false }))
    timesheets = [...timesheets, ...created]
    store(TS_KEY, timesheets)
    return delay(created)
  },

  deleteTimesheet: (id, timesheetId) => {
    const entry = timesheets.find((t) => t.timesheetId === timesheetId && t.employeeId === id)
    if (!entry) return Promise.reject(new Error('Timesheet entry not found'))
    if (entry.submitted) return Promise.reject(new Error('Submitted entries cannot be deleted'))
    if (!isEditableDate(entry.date)) return Promise.reject(lockedError(entry.date))
    timesheets = timesheets.filter((t) => t !== entry)
    store(TS_KEY, timesheets)
    return delay(undefined)
  },

  submitTimesheets: (id, from, to) => {
    if (!isEditableDate(from) || !isEditableDate(to)) return Promise.reject(lockedError(isEditableDate(from) ? to : from))
    timesheets = timesheets.map((t) => (t.employeeId === id && t.date >= from && t.date <= to ? { ...t, submitted: true } : t))
    store(TS_KEY, timesheets)
    return delay(timesheets.filter((t) => t.employeeId === id && t.date >= from && t.date <= to))
  },

  getAggregatePay: (id, year, granularity) => {
    const stubs = allStubs().filter((s) => fromISODate(s.payDate).getFullYear() === year)
    const keyOf = (s: PayStub) => {
      const m = fromISODate(s.payDate).getMonth()
      return granularity === 'ytd' ? 0 : granularity === 'quarterly' ? Math.floor(m / 3) : m
    }
    const groups = new Map<number, PayStub[]>()
    for (const s of stubs) groups.set(keyOf(s), [...(groups.get(keyOf(s)) ?? []), s])
    const periods: PayPeriodAggregate[] = [...groups.entries()].map(([k, list]) => {
      const deductions = list.reduce((d, s) => addDeductions(d, s.deductions), ZERO)
      const gross = round2(list.reduce((n, s) => n + s.gross, 0))
      const [start, end] =
        granularity === 'ytd' ? [new Date(year, 0, 1), new Date(year, 11, 31)]
        : granularity === 'quarterly' ? [new Date(year, k * 3, 1), new Date(year, k * 3 + 3, 0)]
        : [new Date(year, k, 1), new Date(year, k + 1, 0)]
      return {
        label: granularity === 'ytd' ? String(year) : granularity === 'quarterly' ? `Q${k + 1}` : MONTHS[k],
        start: toISODate(start),
        end: toISODate(end),
        hours: list.reduce((n, s) => n + s.hours, 0),
        gross,
        deductions,
        net: round2(gross - sumDeductions(deductions)),
      }
    })
    return delay<AggregatePay>({ employeeId: id, year, granularity, periods })
  },

  getPayStubs: (_id, from, to) =>
    delay(allStubs().filter((s) => s.payDate >= from && s.payDate <= to).map(summary).reverse()),

  getPayStub: (_id, payDate: ISODate) => {
    const stub = allStubs().find((s) => s.payDate === payDate)
    return stub ? delay(stub) : Promise.reject(new Error(`No pay stub for ${payDate}`))
  },

  getProfile: () => delay(publicProfile()),

  updateProfile: (_id, update) => {
    profile = {
      ...profile,
      ...update,
      address: { ...profile.address, ...update.address },
      directDeposit: { ...profile.directDeposit, ...update.directDeposit },
    }
    store(PROFILE_KEY, profile)
    return delay(publicProfile())
  },
}
