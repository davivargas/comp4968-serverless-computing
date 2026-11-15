import { expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import DashboardPage from '@/pages/manager/DashboardPage'
import { managerApi } from '@/lib/manager/api'
import { people, projects, renderManager } from './fixtures'

vi.mock('@/lib/manager/api', () => ({ managerApi: { listEmployees: vi.fn(), listProjects: vi.fn() } }))

test.each([
  ['Review timesheets', '/manager/timesheets'],
  ['Manage projects', '/manager/projects'],
  ['View team', '/manager/team'],
])('dashboard action "%s" navigates to %s', async (name, path) => {
  vi.mocked(managerApi.listEmployees).mockResolvedValue(people)
  vi.mocked(managerApi.listProjects).mockResolvedValue(projects)
  renderManager(<Routes>
    <Route path="/" element={<DashboardPage />} />
    <Route path={path} element={<h1>Destination {path}</h1>} />
  </Routes>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name }))
  expect(screen.getByRole('heading', { name: `Destination ${path}` })).toBeVisible()
})
