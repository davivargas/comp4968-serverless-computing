import { beforeEach, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from '@/components/ui/sonner'
import ProjectsPage from '@/pages/manager/ProjectsPage'
import { managerApi } from '@/lib/manager/api'
import type { ManagerProject } from '@/lib/manager/types'
import { people, projects, renderManager } from './fixtures'

vi.mock('@/lib/manager/api', () => ({ managerApi: {
  listEmployees: vi.fn(), listProjects: vi.fn(), createProject: vi.fn(), updateProject: vi.fn(),
  projectEmployees: vi.fn(), assignEmployee: vi.fn(),
} }))

let state: ManagerProject[]
beforeEach(() => {
  vi.resetAllMocks()
  state = structuredClone(projects)
  vi.mocked(managerApi.listEmployees).mockResolvedValue(people)
  vi.mocked(managerApi.listProjects).mockImplementation(async () => structuredClone(state))
  vi.mocked(managerApi.createProject).mockImplementation(async input => {
    const p: ManagerProject = { projectId: '10', projectCode: input.projectCode ?? 1010, name: input.name, status: 'ACTIVE', employeeCount: 0 }
    state.push(p)
    return p
  })
  vi.mocked(managerApi.updateProject).mockImplementation(async (id, input) => {
    const p = state.find(p => p.projectId === id)!
    if (input.isDeleted) { state = state.filter(p => p.projectId !== id); return }
    Object.assign(p, input)
    return p
  })
  vi.mocked(managerApi.projectEmployees).mockResolvedValue({ projectId: '8', projectCode: 1008, employees: [] })
})

async function openProjects() {
  const user = userEvent.setup()
  renderManager(<><ProjectsPage /><Toaster /></>)
  await screen.findByText('Assignment Testing')
  return user
}
const projectRow = (name = 'Assignment Testing') => screen.getByRole('row', { name: new RegExp(name) })

test('create button validates a name and creates a project with a chosen code', async () => {
  const user = await openProjects()
  await user.click(screen.getByRole('button', { name: 'Create project' }))
  const dialog = screen.getByRole('dialog', { name: 'Create project' })
  expect(within(dialog).getByRole('button', { name: 'Save project' })).toBeDisabled()
  await user.type(within(dialog).getByLabelText('Project name'), 'Customer Portal')
  await user.type(within(dialog).getByLabelText('Project code (optional)'), '1200')
  await user.click(within(dialog).getByRole('button', { name: 'Save project' }))
  expect(await screen.findByText('Customer Portal')).toBeVisible()
  expect(managerApi.createProject).toHaveBeenCalledExactlyOnceWith({ name: 'Customer Portal', projectCode: 1200 })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('omits the code for automatic generation and cancel does not create a project', async () => {
  const user = await openProjects()
  await user.click(screen.getByRole('button', { name: 'Create project' }))
  await user.type(screen.getByLabelText('Project name'), 'Cancelled project')
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(managerApi.createProject).not.toHaveBeenCalled()
  expect(screen.queryByText('Cancelled project')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Create project' }))
  await user.type(screen.getByLabelText('Project name'), 'Generated code')
  await user.click(screen.getByRole('button', { name: 'Save project' }))
  expect(await screen.findByText('Generated code')).toBeVisible()
  expect(managerApi.createProject).toHaveBeenCalledWith({ name: 'Generated code', projectCode: undefined })
})

test('shows a duplicate-code API error and preserves the form for correction', async () => {
  vi.mocked(managerApi.createProject).mockRejectedValue(new Error('Project code is already used'))
  const user = await openProjects()
  await user.click(screen.getByRole('button', { name: 'Create project' }))
  await user.type(screen.getByLabelText('Project name'), 'Duplicate code')
  await user.type(screen.getByLabelText('Project code (optional)'), '1008')
  await user.click(screen.getByRole('button', { name: 'Save project' }))
  expect(await screen.findByText('Project code is already used')).toBeVisible()
  expect(screen.getByLabelText('Project name')).toHaveValue('Duplicate code')
  expect(screen.getByRole('button', { name: 'Save project' })).toBeEnabled()
})

test('renames a project and updates its visible row', async () => {
  const user = await openProjects()
  await user.click(within(projectRow()).getByRole('button', { name: 'Rename' }))
  await user.clear(screen.getByLabelText('Project name'))
  await user.type(screen.getByLabelText('Project name'), 'Renamed project')
  await user.click(screen.getByRole('button', { name: 'Save project' }))
  expect(await screen.findByText('Renamed project')).toBeVisible()
  expect(managerApi.updateProject).toHaveBeenCalledWith('8', { name: 'Renamed project' })
  expect(screen.queryByText('Assignment Testing')).not.toBeInTheDocument()
})

test('close and reopen buttons change the project status', async () => {
  const user = await openProjects()
  await user.click(within(projectRow()).getByRole('button', { name: 'Close', exact: true }))
  await waitFor(() => expect(within(projectRow()).getByText('CLOSED')).toBeVisible())
  expect(managerApi.updateProject).toHaveBeenLastCalledWith('8', { status: 'CLOSED' })
  await user.click(within(projectRow()).getByRole('button', { name: 'Reopen' }))
  await waitFor(() => expect(within(projectRow()).getByText('ACTIVE')).toBeVisible())
  expect(managerApi.updateProject).toHaveBeenLastCalledWith('8', { status: 'ACTIVE' })
})

test('delete requires confirmation; cancelling keeps the project', async () => {
  const user = await openProjects()
  await user.click(within(projectRow()).getByRole('button', { name: 'Delete', exact: true }))
  expect(managerApi.updateProject).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
  expect(projectRow()).toBeVisible()
  await user.click(within(projectRow()).getByRole('button', { name: 'Delete', exact: true }))
  await user.click(screen.getByRole('button', { name: 'Delete project', exact: true }))
  await waitFor(() => expect(screen.queryByText('Assignment Testing')).not.toBeInTheDocument())
  expect(managerApi.updateProject).toHaveBeenCalledWith('8', { isDeleted: true })
})

test('assigns an active employee, shows the assignment, and prevents duplicate choices', async () => {
  vi.mocked(managerApi.assignEmployee).mockImplementation(async (projectId, employeeId) => {
    state[0].employeeCount = 1
    vi.mocked(managerApi.projectEmployees).mockResolvedValue({ projectId, projectCode: 1008, employees: [people[0]] })
    return { projectId, employeeId, alreadyAssigned: false }
  })
  const user = await openProjects()
  await user.click(within(projectRow()).getByRole('button', { name: 'Assignments' }))
  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByText('No employees assigned.')).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Assign employee' })).toBeDisabled()
  expect(within(dialog).queryByRole('option', { name: 'Inactive Person' })).not.toBeInTheDocument()
  expect(within(dialog).getByRole('option', { name: 'Kevin Romero' })).toBeInTheDocument()
  expect(within(dialog).queryByRole('option', { name: 'Alice Johnson' })).not.toBeInTheDocument()
  await user.selectOptions(within(dialog).getByLabelText('Assign employee'), '51')
  await user.click(within(dialog).getByRole('button', { name: 'Assign employee' }))
  await waitFor(() => expect(within(dialog).queryByRole('option', { name: 'Juan Pablo' })).not.toBeInTheDocument())
  expect(within(dialog).getByText('Juan Pablo')).toBeVisible()
  expect(managerApi.assignEmployee).toHaveBeenCalledExactlyOnceWith('8', '51')
  await user.keyboard('{Escape}')
  expect(within(projectRow()).getByRole('cell', { name: '1', exact: true })).toBeVisible()
  expect(within(projectRow()).getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
})

test('closed projects disable assignment controls', async () => {
  const user = await openProjects()
  await user.click(within(projectRow('Closed Project')).getByRole('button', { name: 'Assignments' }))
  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByText('Reopen this project to add assignments.')).toBeVisible()
  expect(within(dialog).getByLabelText('Assign employee')).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Assign employee' })).toBeDisabled()
  expect(managerApi.assignEmployee).not.toHaveBeenCalled()
})

test('assignment errors stay visible and allow another attempt', async () => {
  vi.mocked(managerApi.assignEmployee).mockRejectedValue(new Error('That employee is not an active member of a team you manage'))
  const user = await openProjects()
  await user.click(within(projectRow()).getByRole('button', { name: 'Assignments' }))
  await screen.findByText('No employees assigned.')
  const dialog = screen.getByRole('dialog')
  await user.selectOptions(within(dialog).getByLabelText('Assign employee'), '51')
  await user.click(within(dialog).getByRole('button', { name: 'Assign employee' }))
  expect(await screen.findByText('That employee is not an active member of a team you manage')).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Assign employee' })).toBeEnabled()
})

test('load errors show a retry button that reloads the projects', async () => {
  vi.mocked(managerApi.listProjects).mockRejectedValueOnce(new Error('Unable to load projects'))
  const user = userEvent.setup()
  renderManager(<ProjectsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load projects')
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('Assignment Testing')).toBeVisible()
})
