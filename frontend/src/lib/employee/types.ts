// Shapes shared between the employee UI and the backend. Keep in sync with docs/employee-api.md.

/** YYYY-MM-DD */
export type ISODate = string
/** HH:mm, 24h */
export type ClockTime = string

export interface Project {
  projectCode: string
  name: string
}

export interface TimesheetEntry {
  timesheetId: string
  employeeId: string
  date: ISODate
  startTime: ClockTime
  endTime: ClockTime
  projectCode: string
  submitted: boolean
  approved: boolean
}

/** What the client sends to create an entry; the backend assigns timesheetId and the flags. */
export type NewTimesheetEntry = Pick<TimesheetEntry, 'date' | 'startTime' | 'endTime' | 'projectCode'>

/**
 * A semi-monthly pay period (1st–15th or 16th–end of month), as decided by the backend.
 * `editable` is the lock: only an editable period accepts new, changed or deleted time.
 */
export interface PayPeriod {
  start: ISODate
  end: ISODate
  payDate: ISODate
  isCurrent: boolean
  editable: boolean
}

export interface Address {
  street: string
  city: string
  province: string
  postalCode: string
  country: string
}

export interface DirectDeposit {
  institutionNumber: string // 3 digits
  transitNumber: string // 5 digits
  accountNumber: string // 7–12 digits; GET returns it masked, e.g. "*****6789"
}

export interface EmployeeProfile {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  position: string
  payGrade: string
  hourlyRate: number
  phone: string
  address: Address
  directDeposit: DirectDeposit
}

/** PATCH body: send only what changed. Omit directDeposit.accountNumber to keep the current account. */
export interface ProfileUpdate {
  phone?: string
  address?: Address
  directDeposit?: Partial<DirectDeposit>
}

export interface Deductions {
  federalTax: number
  provincialTax: number
  cpp: number
  ei: number
}

export type Granularity = 'ytd' | 'quarterly' | 'monthly'

export interface PayPeriodAggregate {
  label: string // "2026", "Q3", "Sep"
  start: ISODate
  end: ISODate
  hours: number
  gross: number
  deductions: Deductions
  net: number
}

export interface AggregatePay {
  employeeId: string
  year: number
  granularity: Granularity
  periods: PayPeriodAggregate[]
}

export interface PayStubSummary {
  payDate: ISODate // always the 1st or the 15th
  periodStart: ISODate
  periodEnd: ISODate
  hours: number
  gross: number
  net: number
}

export interface PayStubLine {
  projectCode: string
  hours: number
  rate: number
  amount: number
}

export interface PayStub extends PayStubSummary {
  employeeId: string
  employeeName: string
  position: string
  earnings: PayStubLine[]
  deductions: Deductions
  ytd: { gross: number; deductions: Deductions; net: number }
  depositAccount: string // masked
}
