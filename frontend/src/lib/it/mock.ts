// In-browser stand-in for the IT admin API so the UI works before the backend exists.
// Changes persist in localStorage; clear the "mock.it.employees" key to reset.
import type { ITApi } from './api'
import type { Employee } from './types'

const KEY = 'mock.it.employees'

// E1001 matches the employee portal's mock profile so both portals show the same person.
const SEED: Employee[] = [
  { id: 'E1001', name: 'Alex Morgan', email: 'alex.morgan@example.com', title: 'Software Engineer 2', role: 'EMPLOYEE', active: true, managerId: 'E1002', managerName: 'Alice Johnson' },
  { id: 'E1002', name: 'Alice Johnson', email: 'alice.johnson@example.com', title: 'Engineering Manager', role: 'MANAGER', active: true, managerId: null, managerName: null },
  { id: 'E1003', name: 'Carol Lee', email: 'carol.lee@example.com', title: 'Senior Software Engineer', role: 'EMPLOYEE', active: true, managerId: 'E1002', managerName: 'Alice Johnson' },
  { id: 'E1004', name: 'David Kim', email: 'david.kim@example.com', title: 'IT Administrator', role: 'IT_ADMIN', active: true, managerId: null, managerName: null },
  { id: 'E1005', name: 'Eve Park', email: 'eve.park@example.com', title: 'Software Engineer 1', role: 'EMPLOYEE', active: false, managerId: 'E1002', managerName: 'Alice Johnson' },
  { id: 'E1006', name: 'Priya Shah', email: 'priya.shah@example.com', title: 'Payroll Specialist', role: 'PAYROLL_ADMIN', active: true, managerId: null, managerName: null },
]

function load(): Employee[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Employee[]) : structuredClone(SEED)
  } catch {
    return structuredClone(SEED)
  }
}
function save(list: Employee[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable: changes live for this page load only */
  }
}

let employees = load()

const delay = <T>(value: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms))
const find = (id: string) => {
  const e = employees.find((x) => x.id === id)
  if (!e) throw new Error('Employee not found')
  return e
}
const nameOf = (id: string | null) => (id ? (employees.find((x) => x.id === id)?.name ?? null) : null)
const emailTaken = (email: string, exceptId?: string) =>
  employees.some((e) => e.id !== exceptId && e.email.toLowerCase() === email.toLowerCase())
const nextId = () => `E${Math.max(1000, ...employees.map((e) => Number(e.id.slice(1)) || 0)) + 1}`

export const mockApi: ITApi = {
  async listEmployees() {
    return delay(employees.map((e) => ({ ...e, managerName: nameOf(e.managerId) })))
  },

  async createAccount(input) {
    if (emailTaken(input.email)) throw new Error('An account with this email already exists')
    const emp: Employee = {
      id: nextId(), name: input.name, email: input.email, title: input.title, role: input.role,
      active: true, managerId: input.managerId, managerName: nameOf(input.managerId),
    }
    employees = [...employees, emp]
    save(employees)
    return delay(emp)
  },

  async changeRole(id, role, adminPassword) {
    const e = find(id)
    // The real backend verifies this password; the mock only checks one was supplied.
    if ((role === 'IT_ADMIN' || e.role === 'IT_ADMIN') && !adminPassword) throw new Error('Password required')
    e.role = role
    save(employees)
    return delay(undefined)
  },

  async changeTitle(id, title) {
    find(id).title = title
    save(employees)
    return delay(undefined)
  },

  async setActive(id, active) {
    find(id).active = active
    save(employees)
    return delay(undefined)
  },

  async resetCredentials(id, input) {
    const e = find(id)
    if (input.email) {
      if (emailTaken(input.email, id)) throw new Error('An account with this email already exists')
      e.email = input.email
    }
    // The password goes to the backend only; it is never stored or shown here.
    save(employees)
    return delay(undefined)
  },
}
