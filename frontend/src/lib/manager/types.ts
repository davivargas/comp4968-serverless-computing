export interface ManagedEmployee {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  status: 'ACTIVE' | 'INACTIVE'
  position: string
  team: string
}

export interface ManagerTimesheet {
  timesheetId: string
  employeeId: string
  employeeName: string
  date: string
  startTime: string
  endTime: string
  projectCode: string
  projectName: string
  submitted: boolean
  approved: boolean
}

export interface ManagerProject {
  projectId: string
  projectCode: number
  name: string
  status: 'ACTIVE' | 'CLOSED'
  employeeCount: number
}

export interface TimesheetQuery {
  status?: 'pending' | 'approved' | 'unsubmitted'
  employeeId?: string
  from?: string
  to?: string
  sort?: 'date' | 'employee'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
export interface TimesheetList { timesheets: ManagerTimesheet[]; limit: number; offset: number }
export interface PeriodInput { from: string; to: string }
export interface ProjectInput { name: string; projectCode?: number }
export interface ProjectUpdate { name?: string; status?: 'ACTIVE' | 'CLOSED'; isDeleted?: true }
export interface ProjectEmployees {
  projectId: string
  projectCode: number
  employees: Pick<ManagedEmployee, 'employeeId' | 'firstName' | 'lastName' | 'status'>[]
}
