export interface Portal {
  id: string
  name: string
  description: string
  path: string // where the user lands after signing in
}

export const PORTALS: Portal[] = [
  { id: 'employee', name: 'Employee', description: 'Submit timesheets, view projects and personal earnings.', path: '/employee' },
  { id: 'manager', name: 'Manager', description: 'Review and approve team timesheets and manage projects.', path: '/manager' },
  { id: 'payroll', name: 'Payroll Admin', description: 'Manage employee records and release payroll.', path: '/payroll' },
  { id: 'it', name: 'IT Admin', description: 'Manage user accounts, roles and system access.', path: '/it' },
]
