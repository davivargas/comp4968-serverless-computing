import { beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { auditorApi } from '@/lib/auditor/api'
import type { AuditLogEntry } from '@/lib/auditor/types'
import AuditLogPage from '@/pages/auditor/AuditLogPage'

vi.mock('@/lib/auditor/api', () => ({
  usingMockApi: false,
  auditorApi: { listAuditLogs: vi.fn(), searchEmployees: vi.fn() },
}))
const api = vi.mocked(auditorApi)

const approval: AuditLogEntry = {
  auditId: 'a-1', table: 'timesheet_entry', recordId: '5000', action: 'UPDATE', changedBy: 1006, changedByName: 'Mason Young',
  changedAt: '2026-11-20T18:30:00.000000+00:00', oldValues: { status: 'SUBMITTED' }, newValues: { status: 'APPROVED' },
}
const phoneChange: AuditLogEntry = {
  auditId: 'a-2', table: 'employee', recordId: '1009', action: 'UPDATE', changedBy: 1009, changedByName: 'Eve Park',
  changedAt: '2026-11-19T18:30:00.000000+00:00', oldValues: { phone: '604-555-0142' }, newValues: { phone: '778-555-0199' },
}

let location = ''
function LocationProbe() {
  location = useLocation().search
  return null
}

function renderPage(url = '/auditor/logs') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/auditor/logs" element={<><AuditLogPage /><LocationProbe /></>} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  api.listAuditLogs.mockResolvedValue({ logs: [approval, phoneChange], nextToken: null })
  api.searchEmployees.mockResolvedValue([])
})

test('lists recorded changes with who made them and what changed', async () => {
  renderPage()
  expect(await screen.findByText('Status: SUBMITTED → APPROVED')).toBeVisible()
  expect(screen.getByText('Mason Young')).toBeVisible()
  expect(screen.getByText('Timesheet entry')).toBeVisible()
  expect(screen.getByText(/Showing 2 changes/)).toBeVisible()
})

test('reads its filters from the URL and sends them to the API', async () => {
  renderPage('/auditor/logs?from=2026-10-01&to=2026-11-01&action=DELETE&table=employee&recordId=1009&changedBy=1006&by=Mason+Young')
  await waitFor(() => expect(api.listAuditLogs).toHaveBeenCalled())
  expect(api.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({
    from: '2026-10-01', to: '2026-11-01', action: 'DELETE', table: 'employee', recordId: '1009', changedBy: '1006',
  }))
  expect(screen.getByRole('combobox', { name: 'Changed by' })).toHaveValue('Mason Young')
})

test('clicking a person filters to the changes they made', async () => {
  renderPage()
  await screen.findByText('Eve Park')
  await userEvent.click(screen.getAllByTitle('Show every change this person made')[1])
  await waitFor(() => expect(api.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ changedBy: '1009' })))
  expect(new URLSearchParams(location).get('by')).toBe('Eve Park')
})

test('clicking a record filters to that record’s history without expanding the row', async () => {
  renderPage()
  await screen.findByText('Status: SUBMITTED → APPROVED')
  await userEvent.click(screen.getAllByTitle('Show every change to this record')[1])
  await waitFor(() => expect(api.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ table: 'employee', recordId: '1009' })))
})

test('expanding a row shows each field before and after', async () => {
  renderPage()
  await userEvent.click(await screen.findByText('Phone: 604-555-0142 → 778-555-0199'))
  const details = screen.getByText('Field').closest('table') as HTMLElement
  expect(within(details).getByText('604-555-0142')).toBeVisible()
  expect(within(details).getByText('778-555-0199')).toBeVisible()
  expect(screen.getByText('a-2')).toBeVisible()
})

test('the Changed by search picks a person from the employee lookup', async () => {
  api.searchEmployees.mockResolvedValue([{ employeeId: '1005', firstName: 'Balpreet', lastName: 'Sekhon', email: 'b@example.com' }])
  renderPage()
  await userEvent.type(screen.getByRole('combobox', { name: 'Changed by' }), 'Bal')
  await userEvent.click(await screen.findByRole('option', { name: /Balpreet Sekhon/ }))
  expect(api.searchEmployees).toHaveBeenCalledWith('Bal', 8)
  await waitFor(() => expect(api.listAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ changedBy: '1005' })))
})

test('rejects a date range the API would refuse, without calling it', async () => {
  renderPage('/auditor/logs?from=2025-01-01&to=2026-11-01')
  expect(await screen.findByRole('alert')).toHaveTextContent('at most 366 days')
  expect(api.listAuditLogs).not.toHaveBeenCalled()
})

test('shows the API error with a retry when the log cannot load', async () => {
  api.listAuditLogs.mockRejectedValueOnce(new Error('This page requires the AUDITOR role'))
  renderPage()
  expect(await screen.findByText('This page requires the AUDITOR role')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /Try again/ }))
  expect(await screen.findByText('Mason Young')).toBeVisible()
})
