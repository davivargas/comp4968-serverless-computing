// Shapes for the IT API (see docs/it-api.md). Passwords are never returned by the API.

/** Access role. Everyone is an employee; a user has at most one extra role. */
export type Role = 'EMPLOYEE' | 'MANAGER' | 'PAYROLL_ADMIN' | 'IT'

export const ROLES: { value: Role; label: string }[] = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'PAYROLL_ADMIN', label: 'Payroll Admin' },
  { value: 'IT', label: 'IT Admin' },
]

export const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r

export type Status = 'ACTIVE' | 'DEACTIVATED'

export interface Address {
  street: string
  city: string
  province: string
  postalCode: string
  country: string
}

export interface User {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: Address | null
  status: Status
  hireDate: string // YYYY-MM-DD
  role: Role
  positionId: number
  position: string
  /** null = topmost person (no team, no manager). */
  teamId: number | null
  team: string | null
  managerId: string | null
  managerName: string | null
}

export const fullName = (u: Pick<User, 'firstName' | 'lastName'>) => `${u.firstName} ${u.lastName}`

export interface Me {
  employeeId: string
  firstName: string
  lastName: string
  availableRoles: Role[]
}

export interface Team {
  teamId: number
  name: string
  managerId: string
  managerName: string
  memberCount: number
}

export interface Position {
  positionId: number
  title: string
  payGrade: string
}

export type UserSort = 'id' | 'name' | 'email'

export interface ListUsersParams {
  status?: Status
  role?: Role
  teamId?: number
  search?: string // name or email
  sort?: UserSort
  order?: 'asc' | 'desc'
  limit?: number // 1-200, default 50
  offset?: number
}

export interface UsersPage {
  total: number
  limit: number
  offset: number
  users: User[]
}

export interface CreateAccountInput {
  firstName: string
  lastName: string
  email: string
  positionId: number
  hireDate: string
  phone?: string // E.164, Canadian/US
  address?: Address
  teamId?: number // leave out for the topmost person
  role?: Role // default EMPLOYEE
}

/** Any of these; `teamId: null` moves the user to the top (no team), `phone: null` clears it. */
export interface UpdateUserInput {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string | null
  address?: Address
  positionId?: number
  teamId?: number | null
}

export interface TeamInput {
  name: string
  managerId: string
}
