import { expect, test, vi } from 'vitest'
import { screen } from '@testing-library/react'
import ManagerLayout from '@/pages/manager/ManagerLayout'
import { renderManager } from './fixtures'

vi.mock('@/lib/manager/api', () => ({ usingMockApi: false }))
// Decorative helpers are unrelated to the layout's identity and navigation contract.
vi.mock('@/components/TipBuddy', () => ({ default: () => null }))

test('greets the authenticated manager and exposes all manager navigation links', () => {
  renderManager(<ManagerLayout />)
  expect(screen.getByText('Kevin', { exact: true })).toBeVisible()
  expect(screen.queryByText('Alice', { exact: true })).not.toBeInTheDocument()
  expect(screen.queryByText('Mock API')).not.toBeInTheDocument()
  for (const [label, path] of [
    ['Dashboard', '/manager/dashboard'], ['Timesheets', '/manager/timesheets'],
    ['Projects', '/manager/projects'], ['Team', '/manager/team'],
  ]) {
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', path)
  }
})
