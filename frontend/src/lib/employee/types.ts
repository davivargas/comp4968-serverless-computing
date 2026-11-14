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
 * A bi-weekly pay period (14 days), as decided by the backend. The frontend never computes period dates.
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
  // The backend sends null for details the employee hasn't filled in yet.
  phone: string | null
  address: Address | null
  directDeposit: DirectDeposit | null
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
  payDate: ISODate // set by the backend's bi-weekly schedule
  periodStart: ISODate
  periodEnd: ISODate
  hours: number
  gross: number
  net: number
}

export type EarningLineType = 'PROJECT' | 'OVERTIME_PREMIUM' | 'VACATION'

export interface PayStubLine {
  /** Set by the real backend; the mock only produces project lines. */
  lineType?: EarningLineType
  /** Null on overtime-premium and vacation lines that aren't tied to a project. */
  projectCode: string | number | null
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
  ytd: { hours: number; gross: number; deductions: Deductions; net: number }
  depositAccount: string // masked
}
