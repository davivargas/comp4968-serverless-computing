export interface PayrollEmployee {
  id: string
  name: string
  email: string
  position: string
  positionId: string
  team: string
  project: string
  managerName: string | null
  status: 'active' | 'inactive'
  startDate: string
  hourlyRate: number
}

export interface EmployeeRecord extends PayrollEmployee {
  phone: string
  address: string
  payGrade: string
  totalHours: number
  ytdGross: number
  lastPayPeriod: string
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
  position?: string
  team?: string
  project?: string
  status?: 'active' | 'inactive'
  from?: string
  to?: string
  search?: string
}

export interface CreatePositionInput {
  title: string
  payGrade: string
  hourlyRate: number
  effectiveFrom: string
}
