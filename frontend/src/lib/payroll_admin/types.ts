export interface PayrollEmployee {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  name: string
  email: string | null
  position: string
  positionId: string
  teamId: string | null
  team: string
  projectId: string | null
  project: string | null
  managerName: string | null
  status: 'active' | 'inactive'
  hours: number
  gross: number
  deductions: number
  net: number
  hourlyRate?: number
  startDate?: string
}

export interface EmployeeRecord extends PayrollEmployee {
  email: string
  phone: string | null
  address: string | null
  hireDate: string
  startDate: string
  hourlyRate: number
  payGrade: string
  totalHours: number
  ytdGross: number
  lastPayPeriod: string
  depositAccountLast4: string | null
  aggregate: PayAggregate
  payStubs: PayStub[]
}

export interface PayAggregate {
  hours: number
  gross: number
  deductions: number
  net: number
}

export interface PayStub extends PayAggregate {
  payDate: string
  periodStart: string
  periodEnd: string
}

export interface EmployeeListResult {
  total: number
  aggregationPeriod: string
  limit: number
  offset: number
  employees: PayrollEmployee[]
}

export interface EmployeeDetailResult {
  employee: EmployeeRecord
  aggregationPeriod: string
  aggregate: PayAggregate
  payStubs: PayStub[]
}

export interface Position {
  positionId: string
  title: string
  payGrade: string
  hourlyRate: number
  effectiveFrom: string
  nextWage: { hourlyRate: number; effectiveFrom: string } | null
}

export interface PayPeriod {
  payPeriodId: string
  start: string
  end: string
  payDate: string
  status: 'OPEN' | 'RELEASED'
  unapprovedCount: number
  employeeCount: number
  canRelease: boolean
  releasedAt: string | null
}

export interface EmployeeFilters {
  status?: 'ACTIVE' | 'DEACTIVATED'
  positionId?: string
  teamId?: string
  projectId?: string
  payDate?: string
  fromPayDate?: string
  toPayDate?: string
  year?: number
  search?: string
  sort?: 'id' | 'name' | 'position' | 'team' | 'gross' | 'hours'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface PayrollReleaseResult {
  payPeriodId: string
  status: 'RELEASED'
  paystubsCreated: number
  paystubs: Array<{ paystubId: string; employeeId: string; gross: number; net: number; weekendHours?: number; statHolidayHours?: number; sickLeaveHours?: number; vacationLeaveHours?: number }>
}

export interface StatHoliday { date: string; name: string }

export interface AuditLogEntry {
  auditId: string
  table: string
  recordId: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changedBy: number | null
  changedByName: string | null
  changedAt: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}

export interface AuditLogResult { logs: AuditLogEntry[]; nextToken: string | null }

export interface CreatePositionInput {
  title: string
  payGrade: string
  hourlyRate: number
  effectiveFrom: string
}
