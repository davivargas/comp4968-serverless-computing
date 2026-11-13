// In-browser stand-in for the IT admin API so the UI works before the backend exists.
// It enforces the same rules and error cases as docs/it-api.md. Changes persist in localStorage;
// clear the "mock.it.v2" key to reset.
import type { ITApi } from './api'
import { CURRENT_ADMIN_ID } from './session'
import type { Position, Role, Team, User } from './types'

const KEY = 'mock.it.v2'

const POSITIONS: Position[] = [
  { positionId: 1, title: 'Software Engineer 1', payGrade: 'P1' },
  { positionId: 2, title: 'Software Engineer 2', payGrade: 'P2' },
  { positionId: 3, title: 'Senior Software Engineer', payGrade: 'P3' },
  { positionId: 4, title: 'Principal Software Engineer', payGrade: 'P4' },
  { positionId: 5, title: 'Engineering Manager', payGrade: 'P5' },
  { positionId: 6, title: 'Director of Engineering', payGrade: 'P6' },
  { positionId: 7, title: 'IT Administrator', payGrade: 'P3' },
  { positionId: 8, title: 'Payroll Specialist', payGrade: 'P3' },
]

// What's stored; position, team and manager details are derived when read.
interface Row {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  address: User['address']
  status: User['status']
  hireDate: string
  role: Role
  positionId: number
  teamId: number | null
}
interface TeamRow { teamId: number; name: string; managerId: string; deleted?: boolean }
interface State { rows: Row[]; teams: TeamRow[]; nextTeamId: number }

const row = (employeeId: string, firstName: string, lastName: string, role: Role, positionId: number, teamId: number | null,
  status: User['status'] = 'ACTIVE', hireDate = '2023-03-01'): Row => ({
  employeeId, firstName, lastName, email: `${firstName}.${lastName}@example.com`.toLowerCase(), phone: null, address: null,
  status, hireDate, role, positionId, teamId,
})

const SEED: State = {
  rows: [
    row('E1001', 'Alex', 'Morgan', 'EMPLOYEE', 2, 1),
    row('E1002', 'Alice', 'Johnson', 'MANAGER', 5, 3),
    row('E1003', 'Carol', 'Lee', 'EMPLOYEE', 3, 1),
    row('E1004', 'David', 'Kim', 'IT', 7, 3),
    row('E1005', 'Eve', 'Park', 'EMPLOYEE', 1, 1, 'DEACTIVATED'),
    row('E1006', 'Priya', 'Shah', 'PAYROLL_ADMIN', 8, 3),
    row('E1007', 'Dana', 'Rivera', 'MANAGER', 6, null, 'ACTIVE', '2019-06-10'),
    row('E1008', 'Marcus', 'Webb', 'MANAGER', 5, 3),
    row('E1009', 'Noah', 'Chen', 'EMPLOYEE', 1, 2),
  ],
  teams: [
    { teamId: 1, name: 'Platform', managerId: 'E1002' },
    { teamId: 2, name: 'Mobile', managerId: 'E1008' },
    { teamId: 3, name: 'Engineering', managerId: 'E1007' },
  ],
  nextTeamId: 4,
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as State) : structuredClone(SEED)
  } catch {
    return structuredClone(SEED)
  }
}
let state = load()
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* changes live for this page load only */ }
}

const delay = <T>(value: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(structuredClone(value)), ms))
const reject = (message: string) => new Promise<never>((_, r) => setTimeout(() => r(new Error(message)), 250))

const liveTeams = () => state.teams.filter((t) => !t.deleted)
const findRow = (id: string) => state.rows.find((r) => r.employeeId === id)
const nameOf = (id: string) => { const r = findRow(id); return r ? `${r.firstName} ${r.lastName}` : '' }
const members = (teamId: number) => state.rows.filter((r) => r.teamId === teamId)
const emailTaken = (email: string, exceptId?: string) =>
  state.rows.some((r) => r.employeeId !== exceptId && r.email.toLowerCase() === email.toLowerCase())

function toUser(r: Row): User {
  const team = liveTeams().find((t) => t.teamId === r.teamId)
  return {
    ...r,
    position: POSITIONS.find((p) => p.positionId === r.positionId)?.title ?? '',
    team: team?.name ?? null,
    managerId: team?.managerId ?? null,
    managerName: team ? nameOf(team.managerId) : null,
  }
}
const toTeam = (t: TeamRow): Team => ({
  teamId: t.teamId, name: t.name, managerId: t.managerId, managerName: nameOf(t.managerId), memberCount: members(t.teamId).length,
})
const positionExists = (id: number) => POSITIONS.some((p) => p.positionId === id)
const teamExists = (id: number) => liveTeams().some((t) => t.teamId === id)
const managesTeam = (id: string) => liveTeams().some((t) => t.managerId === id)

const idNum = (id: string) => Number(id.slice(1)) || 0

export const mockApi: ITApi = {
  async getMe() {
    const r = findRow(CURRENT_ADMIN_ID)!
    return delay({ employeeId: r.employeeId, firstName: r.firstName, lastName: r.lastName, availableRoles: ['EMPLOYEE', 'IT'] as Role[] })
  },

  async listUsers(p = {}) {
    const q = p.search?.trim().toLowerCase()
    let list = state.rows.filter((r) =>
      (!p.status || r.status === p.status) &&
      (!p.role || r.role === p.role) &&
      (p.teamId === undefined || r.teamId === p.teamId) &&
      (!q || `${r.firstName} ${r.lastName}`.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)))
    const sort = p.sort ?? 'id'
    const dir = p.order === 'desc' ? -1 : 1
    list = list.sort((a, b) =>
      dir * (sort === 'id' ? idNum(a.employeeId) - idNum(b.employeeId)
        : sort === 'email' ? a.email.localeCompare(b.email)
        : `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)))
    const limit = Math.min(200, Math.max(1, p.limit ?? 50))
    const offset = p.offset ?? 0
    return delay({ total: list.length, limit, offset, users: list.slice(offset, offset + limit).map(toUser) })
  },

  async getUser(id) {
    const r = findRow(id)
    return r ? delay(toUser(r)) : reject('User not found')
  },

  async createAccount(input) {
    if (emailTaken(input.email)) return reject('An account with this email already exists')
    if (!positionExists(input.positionId)) return reject('That position does not exist')
    if (input.teamId !== undefined && !teamExists(input.teamId)) return reject('That team does not exist')
    const r: Row = {
      employeeId: `E${Math.max(1000, ...state.rows.map((x) => idNum(x.employeeId))) + 1}`,
      firstName: input.firstName, lastName: input.lastName, email: input.email,
      phone: input.phone ?? null, address: input.address ?? null, status: 'ACTIVE', hireDate: input.hireDate,
      role: input.role ?? 'EMPLOYEE', positionId: input.positionId, teamId: input.teamId ?? null,
    }
    state.rows.push(r)
    save()
    return delay(toUser(r))
  },

  async updateUser(id, input) {
    const r = findRow(id)
    if (!r) return reject('User not found')
    if (input.email && emailTaken(input.email, id)) return reject('An account with this email already exists')
    if (input.positionId !== undefined && !positionExists(input.positionId)) return reject('That position does not exist')
    if (input.teamId != null && !teamExists(input.teamId)) return reject('That team does not exist')
    Object.assign(r, input)
    save()
    return delay(toUser(r))
  },

  async setStatus(id, status) {
    const r = findRow(id)
    if (!r) return reject('User not found')
    if (status === 'DEACTIVATED') {
      if (id === CURRENT_ADMIN_ID) return reject("You can't deactivate your own account")
      const team = liveTeams().find((t) => t.managerId === id && members(t.teamId).length > 0)
      if (team) return reject(`${nameOf(id)} still manages the ${team.name} team. Give the team another manager first.`)
    }
    r.status = status
    save()
    return delay(toUser(r))
  },

  async setRole(id, role) {
    const r = findRow(id)
    if (!r) return reject('User not found')
    if (id === CURRENT_ADMIN_ID) return reject("You can't change your own role")
    const next = role ?? 'EMPLOYEE'
    if (r.role === 'MANAGER' && next !== 'MANAGER' && managesTeam(id))
      return reject(`${nameOf(id)} still manages a team. Give the team another manager first.`)
    r.role = next
    save()
    return delay(toUser(r))
  },

  async resetPassword(id) {
    const r = findRow(id)
    if (!r) return reject('User not found')
    if (r.status === 'DEACTIVATED') return reject('This account is deactivated')
    return delay({ message: 'Password reset initiated' })
  },

  async listTeams() {
    return delay(liveTeams().map(toTeam))
  },

  async createTeam(input) {
    if (findRow(input.managerId)?.role !== 'MANAGER') return reject('That user is not a manager')
    if (liveTeams().some((t) => t.name.toLowerCase() === input.name.toLowerCase())) return reject('A team with this name already exists')
    const t: TeamRow = { teamId: state.nextTeamId++, name: input.name, managerId: input.managerId }
    state.teams.push(t)
    save()
    return delay(toTeam(t))
  },

  async updateTeam(id, input) {
    const t = liveTeams().find((x) => x.teamId === id)
    if (!t) return reject('Team not found')
    if (input.managerId && findRow(input.managerId)?.role !== 'MANAGER') return reject('That user is not a manager')
    if (input.name && liveTeams().some((x) => x.teamId !== id && x.name.toLowerCase() === input.name!.toLowerCase()))
      return reject('A team with this name already exists')
    Object.assign(t, input)
    save()
    return delay(toTeam(t))
  },

  async deleteTeam(id) {
    const t = liveTeams().find((x) => x.teamId === id)
    if (!t) return reject('Team not found')
    if (members(id).length > 0) return reject(`${t.name} still has employees. Move them to another team first.`)
    t.deleted = true
    save()
    return delay(undefined)
  },

  async listPositions() {
    return delay(POSITIONS)
  },
}
