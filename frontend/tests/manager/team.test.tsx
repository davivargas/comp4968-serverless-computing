import { expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import TeamPage from '@/pages/manager/TeamPage'
import { people, projects, renderManager } from './fixtures'
import { managerApi } from '@/lib/manager/api'

vi.mock('@/lib/manager/api', () => ({ managerApi: { listEmployees: vi.fn(), listProjects: vi.fn() } }))

test('loads the signed-in manager’s team and displays employee details', async () => {
  vi.mocked(managerApi.listEmployees).mockResolvedValue(people)
  vi.mocked(managerApi.listProjects).mockResolvedValue(projects)
  renderManager(<TeamPage />)
  expect(await screen.findByText('Juan Pablo')).toBeVisible()
  expect(screen.getByText('Maria Sanchez')).toBeVisible()
  expect(managerApi.listEmployees).toHaveBeenCalledWith('42')
  expect(screen.getAllByText('Engineering')).toHaveLength(3)
  expect(screen.getByText('INACTIVE')).toBeVisible()
})
