export type Role = 'EMPLOYEE' | 'MANAGER' | 'PAYROLL_ADMIN' | 'IT_ADMIN'

export const ROLES: { value: Role; label: string }[] = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'PAYROLL_ADMIN', label: 'Payroll Admin' },
  { value: 'IT_ADMIN', label: 'IT Admin' },
]

export const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)!.label

// Employee info shown to IT admins. Passwords are never returned to the client.
export interface Employee {
  id: string
  name: string
  email: string
  title: string // job title / level (display only)
  role: Role // access role (what the system checks)
  active: boolean
  managerId: string | null
  managerName: string | null
}

export interface CreateAccountInput {
  name: string
  email: string
  title: string
  role: Role
  managerId: string | null
  temporaryPassword: string
}

export interface ResetCredentialsInput {
  email?: string
  password?: string
}
