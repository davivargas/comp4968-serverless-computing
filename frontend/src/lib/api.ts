import type {
  CreateAccountInput,
  Employee,
  ResetCredentialsInput,
  Role,
} from './types'

/**
 * Frontend-only mock of the IT admin API (in-memory, resets on reload).
 * Each function maps to one backend endpoint; replace the bodies with
 * fetch() calls when the backend is available. Signatures should stay the same.
 */

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

let employees: Employee[] = [
  { id: 'E1001', name: 'Alice Johnson', email: 'alice.johnson@example.com', title: 'Engineering Manager', role: 'MANAGER', active: true, managerId: null, managerName: null },
  { id: 'E1002', name: 'Bob Smith', email: 'bob.smith@example.com', title: 'Software Engineer 2', role: 'EMPLOYEE', active: true, managerId: 'E1001', managerName: 'Alice Johnson' },
  { id: 'E1003', name: 'Carol Lee', email: 'carol.lee@example.com', title: 'Senior Software Engineer', role: 'EMPLOYEE', active: true, managerId: 'E1001', managerName: 'Alice Johnson' },
  { id: 'E1004', name: 'David Kim', email: 'david.kim@example.com', title: 'IT Administrator', role: 'IT_ADMIN', active: true, managerId: null, managerName: null },
  { id: 'E1005', name: 'Eve Park', email: 'eve.park@example.com', title: 'Software Engineer 1', role: 'EMPLOYEE', active: false, managerId: 'E1001', managerName: 'Alice Johnson' },
]
let nextId = 1006

const find = (id: string) => {
  const e = employees.find((x) => x.id === id)
  if (!e) throw new Error('Employee not found')
  return e
}

const nameOf = (id: string | null) =>
  id ? (employees.find((x) => x.id === id)?.name ?? null) : null

export async function listEmployees(): Promise<Employee[]> {
  await delay()
  return employees.map((e) => ({ ...e, managerName: nameOf(e.managerId) }))
}

export async function createAccount(input: CreateAccountInput): Promise<Employee> {
  await delay()
  if (employees.some((e) => e.email.toLowerCase() === input.email.toLowerCase()))
    throw new Error('An account with this email already exists')
  const emp: Employee = {
    id: `E${nextId++}`,
    name: input.name,
    email: input.email,
    title: input.title,
    role: input.role,
    active: true,
    managerId: input.managerId,
    managerName: nameOf(input.managerId),
  }
  employees = [...employees, emp]
  return emp
}

// adminPassword: the acting admin's password, required by the backend for IT Admin changes.
export async function changeRole(id: string, role: Role, adminPassword?: string): Promise<void> {
  await delay()
  if ((role === 'IT_ADMIN' || find(id).role === 'IT_ADMIN') && !adminPassword)
    throw new Error('Password required')
  find(id).role = role
}

export async function changeTitle(id: string, title: string): Promise<void> {
  await delay()
  find(id).title = title
}

export async function setActive(id: string, active: boolean): Promise<void> {
  await delay()
  find(id).active = active
}

export async function resetCredentials(
  id: string,
  input: ResetCredentialsInput,
): Promise<void> {
  await delay()
  const e = find(id)
  if (input.email) {
    if (employees.some((x) => x.id !== id && x.email.toLowerCase() === input.email!.toLowerCase()))
      throw new Error('An account with this email already exists')
    e.email = input.email
  }
  // Password is sent to the backend only; it is never stored or shown here.
}
