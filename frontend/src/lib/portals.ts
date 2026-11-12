import type { Role } from '@/lib/auth'

export interface Portal {
  id: string
  role: Role // the role the user must hold to open this portal (sent as X-Active-Role)
  name: string
  description: string
  path: string // where the user lands after signing in
}

export const PORTALS: Portal[] = [
  { id: 'employee', role: 'EMPLOYEE', name: 'Employee', description: 'Submit timesheets, view projects and personal earnings.', path: '/employee' },
  { id: 'manager', role: 'MANAGER', name: 'Manager', description: 'Review and approve team timesheets and manage projects.', path: '/manager' },
  { id: 'payroll', role: 'PAYROLL_ADMIN', name: 'Payroll Admin', description: 'Manage employee records and release payroll.', path: '/payroll' },
  { id: 'it', role: 'IT', name: 'IT Admin', description: 'Manage user accounts, roles and system access.', path: '/it' },
]
