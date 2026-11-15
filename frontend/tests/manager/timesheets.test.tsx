import { beforeEach, expect, test, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from '@/components/ui/sonner'
import TimesheetsPage from '@/pages/manager/TimesheetsPage'
import { managerApi } from '@/lib/manager/api'
import { employeeApi } from '@/lib/employee/api'
import type { ManagerTimesheet } from '@/lib/manager/types'
import { entries, period, renderManager } from './fixtures'

vi.mock('@/lib/manager/api', () => ({ managerApi: { listTimesheets: vi.fn(), reviewPeriod: vi.fn() } }))
vi.mock('@/lib/employee/api', () => ({ employeeApi: { getPayPeriod: vi.fn() } }))

let state: ManagerTimesheet[]
beforeEach(() => {
  vi.resetAllMocks()
  state = structuredClone(entries)
  vi.mocked(employeeApi.getPayPeriod).mockResolvedValue(period)
  vi.mocked(managerApi.listTimesheets).mockImplementation(async () => ({ timesheets: structuredClone(state), limit: 200, offset: 0 }))
  vi.mocked(managerApi.reviewPeriod).mockImplementation(async (id, action) => {
    state = state.map(e => e.employeeId === id ? { ...e, submitted: action === 'approve', approved: action === 'approve' } : e)
    return { entries: state.filter(e => e.employeeId === id) }
  })
})

async function openTimesheets() {
  const user = userEvent.setup()
  renderManager(<><TimesheetsPage /><Toaster /></>)
  await screen.findByRole('button', { name: "View Juan Pablo's timesheet details" })
  return user
}
async function openJuan(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: "View Juan Pablo's timesheet details" }))
  return screen.getByRole('dialog', { name: /Juan Pablo/ })
}

test('shows one employee summary with the complete period’s hours and days', async () => {
  await openTimesheets()
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  const juan = within(table).getByRole('row', { name: /Juan Pablo/ })
  expect(within(juan).getByRole('cell', { name: '12h' })).toBeVisible()
  expect(within(juan).getByRole('cell', { name: '2' })).toBeVisible()
  expect(within(juan).getByText('Pending')).toBeVisible()
  expect(employeeApi.getPayPeriod).toHaveBeenCalledWith('42', undefined)
})

test('View details opens individual dates and projects, then Close dismisses it', async () => {
  const user = await openTimesheets()
  const dialog = await openJuan(user)
  const table = within(dialog).getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(within(table).getByText(/Nov 9, 2026/)).toBeVisible()
  expect(within(table).getByText(/Nov 10, 2026/)).toBeVisible()
  expect(within(table).getAllByText(/1008.*Assignment Testing/)).toHaveLength(2)
  expect(within(table).getByText('8h')).toBeVisible()
  expect(within(table).getByText('4h')).toBeVisible()
  expect(within(dialog).getByText('12h total')).toBeVisible()
  expect(within(dialog).queryByText('Maria Sanchez')).not.toBeInTheDocument()
  // The explicit footer button is distinct from Radix's icon Close button.
  await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('clicking an employee row also opens their details', async () => {
  const user = await openTimesheets()
  await user.click(screen.getByRole('row', { name: /Maria Sanchez/ }))
  expect(screen.getByRole('dialog', { name: /Maria Sanchez/ })).toBeVisible()
})

test('employee and status filters operate on entire summaries', async () => {
  const user = await openTimesheets()
  await user.selectOptions(screen.getByLabelText('Employee'), '51')
  expect(screen.queryByRole('button', { name: /View Maria/ })).not.toBeInTheDocument()
  await user.selectOptions(screen.getByLabelText('Period status'), 'Approved')
  expect(screen.getByText(/No employee timesheets match/)).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Period status'), 'Pending')
  const dialog = await openJuan(user)
  expect(within(dialog).getByText('2 entries')).toBeVisible()
  expect(managerApi.listTimesheets).toHaveBeenCalledTimes(1)
})

test('approval requires confirmation and cancel sends no mutation', async () => {
  const user = await openTimesheets()
  const dialog = await openJuan(user)
  await user.click(within(dialog).getByRole('button', { name: 'Approve pay period' }))
  expect(within(dialog).getByText('Approve this pay period?')).toBeVisible()
  expect(managerApi.reviewPeriod).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(managerApi.reviewPeriod).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: 'Approve pay period' }))
  await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Approve pay period' })).toBeDisabled())
  expect(managerApi.reviewPeriod).toHaveBeenCalledExactlyOnceWith('51', 'approve', { from: period.start, to: period.end })
  expect(within(dialog).getAllByText('Approved')).toHaveLength(3)
})

test('return for changes un-submits the employee’s period and updates its status', async () => {
  const user = await openTimesheets()
  const dialog = await openJuan(user)
  await user.click(within(dialog).getByRole('button', { name: 'Return for changes' }))
  await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Return for changes' })).toBeDisabled())
  expect(managerApi.reviewPeriod).toHaveBeenCalledExactlyOnceWith('51', 'reject', { from: period.start, to: period.end })
  expect(within(dialog).getAllByText('Unsubmitted')).toHaveLength(3)
})

test('unsubmitted entries disable both review actions', async () => {
  const user = await openTimesheets()
  await user.click(screen.getByRole('button', { name: "View Maria Sanchez's timesheet details" }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Approve pay period' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Return for changes' })).toBeDisabled()
  expect(within(dialog).getByText(/All entries must be submitted/)).toBeVisible()
})

test('partially submitted entries allow return but block approval', async () => {
  state[1].submitted = false
  const user = await openTimesheets()
  const dialog = await openJuan(user)
  expect(within(dialog).getByText('Partially submitted')).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Approve pay period' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Return for changes' })).toBeEnabled()
})

test('review failures preserve the confirmation and enable retry', async () => {
  vi.mocked(managerApi.reviewPeriod).mockRejectedValue(new Error('Pay period is locked'))
  const user = await openTimesheets()
  const dialog = await openJuan(user)
  await user.click(within(dialog).getByRole('button', { name: 'Approve pay period' }))
  await user.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  expect(await screen.findByText('Pay period is locked')).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeEnabled()
  expect(within(dialog).getByText('Approve this pay period?')).toBeVisible()
})

test('previous/next buttons request backend periods and block advancing from the current period', async () => {
  const user = await openTimesheets()
  expect(screen.getByRole('button', { name: 'Next pay period' })).toBeDisabled()
  vi.mocked(employeeApi.getPayPeriod).mockResolvedValueOnce({ ...period, start: '2026-10-26', end: '2026-11-08', isCurrent: false })
  await user.click(screen.getByRole('button', { name: 'Previous pay period' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next pay period' })).toBeEnabled())
  expect(employeeApi.getPayPeriod).toHaveBeenLastCalledWith('42', '2026-11-08')
  expect(managerApi.listTimesheets).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-26', to: '2026-11-08' }))
  await user.click(screen.getByRole('button', { name: 'Next pay period' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next pay period' })).toBeDisabled())
  expect(employeeApi.getPayPeriod).toHaveBeenLastCalledWith('42', '2026-11-09')
})

test('summaries include all API pages before calculating hours', async () => {
  vi.mocked(managerApi.listTimesheets)
    .mockResolvedValueOnce({ timesheets: [entries[0]], limit: 1, offset: 0 })
    .mockResolvedValueOnce({ timesheets: [entries[1]], limit: 1, offset: 1 })
    .mockResolvedValueOnce({ timesheets: [], limit: 1, offset: 2 })
  await openTimesheets()
  expect(screen.getByRole('cell', { name: '12h' })).toBeVisible()
  expect(managerApi.listTimesheets).toHaveBeenCalledTimes(3)
  expect(managerApi.listTimesheets).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }))
})

test('load failure can be retried from the UI', async () => {
  vi.mocked(managerApi.listTimesheets).mockRejectedValueOnce(new Error('Timesheets unavailable'))
  const user = userEvent.setup()
  renderManager(<TimesheetsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Timesheets unavailable')
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: "View Juan Pablo's timesheet details" })).toBeVisible()
})
