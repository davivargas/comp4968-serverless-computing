import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SessionContext, type Session } from '@/components/auth/session-context'
import type { Me } from '@/lib/auth'
import type { ManagedEmployee, ManagerProject, ManagerTimesheet } from '@/lib/manager/types'

export const manager = { employeeId: '42', firstName: 'Kevin', lastName: 'Romero', availableRoles: ['EMPLOYEE', 'MANAGER'] } satisfies Me
export const people: ManagedEmployee[] = [
  { employeeId: '51', firstName: 'Juan', lastName: 'Pablo', email: 'juan@example.com', status: 'ACTIVE', position: 'Developer', team: 'Engineering' },
  { employeeId: '52', firstName: 'Maria', lastName: 'Sanchez', email: 'maria@example.com', status: 'ACTIVE', position: 'Designer', team: 'Engineering' },
  { employeeId: '53', firstName: 'Inactive', lastName: 'Person', email: 'inactive@example.com', status: 'INACTIVE', position: 'Developer', team: 'Engineering' },
]
export const projects: ManagerProject[] = [
  { projectId: '8', projectCode: 1008, name: 'Assignment Testing', status: 'ACTIVE', employeeCount: 0 },
  { projectId: '9', projectCode: 1009, name: 'Closed Project', status: 'CLOSED', employeeCount: 0 },
]
export const period = { start: '2026-11-09', end: '2026-11-22', payDate: '2026-11-27', isCurrent: true, editable: true }
export const entries: ManagerTimesheet[] = [
  { timesheetId: '1', employeeId: '51', employeeName: 'Juan Pablo', date: '2026-11-09', startTime: '09:00', endTime: '17:00', projectCode: '1008', projectName: 'Assignment Testing', submitted: true, approved: false },
  { timesheetId: '2', employeeId: '51', employeeName: 'Juan Pablo', date: '2026-11-10', startTime: '09:00', endTime: '13:00', projectCode: '1008', projectName: 'Assignment Testing', submitted: true, approved: false },
  { timesheetId: '3', employeeId: '52', employeeName: 'Maria Sanchez', date: '2026-11-11', startTime: '09:00', endTime: '17:00', projectCode: '1008', projectName: 'Assignment Testing', submitted: false, approved: false },
]

export function renderManager(ui: ReactNode) {
  const session: Session = { status: 'signedIn', me: manager, error: null, refresh: async () => {}, signOut: () => {} }
  return render(<MemoryRouter><SessionContext.Provider value={session}>{ui}</SessionContext.Provider></MemoryRouter>)
}
