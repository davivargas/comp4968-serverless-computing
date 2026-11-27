import { afterEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { fetchMe } from '@/lib/auth'
import { toCsv } from '@/lib/auditor/format'
import LandingPage from '@/pages/LandingPage'

afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const roleOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>

test('the landing page keeps the auditor portal out of the cards and links it from the footer', () => {
  render(<MemoryRouter><LandingPage /></MemoryRouter>)
  expect(screen.queryByRole('heading', { name: 'Auditor' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /External auditor sign-in/ })).toHaveAttribute('href', '/login/auditor')
  expect(screen.getByRole('heading', { name: 'IT Admin' })).toBeVisible()
})

test('an auditor, who holds no EMPLOYEE role, is loaded by asking again as AUDITOR', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(json(403, { error: 'You do not hold the selected role' }))
    .mockResolvedValueOnce(json(200, { employeeId: null, auditorId: 7, firstName: 'Jordan', lastName: 'Blake', availableRoles: ['AUDITOR'] }))
  vi.stubGlobal('fetch', fetch)

  await expect(fetchMe()).resolves.toEqual({ employeeId: '', auditorId: '7', firstName: 'Jordan', lastName: 'Blake', availableRoles: ['AUDITOR'] })
  expect(roleOf(fetch.mock.calls[0])['X-Active-Role']).toBe('EMPLOYEE')
  expect(roleOf(fetch.mock.calls[1])['X-Active-Role']).toBe('AUDITOR')
})

test('employees are loaded with a single EMPLOYEE request', async () => {
  const fetch = vi.fn().mockResolvedValue(json(200, { employeeId: 42, firstName: 'Kevin', lastName: 'Romero', availableRoles: ['EMPLOYEE', 'MANAGER'] }))
  vi.stubGlobal('fetch', fetch)

  await expect(fetchMe()).resolves.toMatchObject({ employeeId: '42', auditorId: undefined })
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('a 403 that is not about the role, such as a deactivated account, still shows its own message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { error: 'Account is deactivated' })))
  await expect(fetchMe()).rejects.toThrow('Account is deactivated')
})

test('the CSV export quotes every cell so commas and quotes in values survive', () => {
  const csv = toCsv([{
    auditId: 'a-1', table: 'project', recordId: '3', action: 'UPDATE', changedBy: null, changedByName: null,
    changedAt: '2026-11-20T18:30:00Z', oldValues: { name: 'Mobile, "v1"' }, newValues: { name: 'Mobile v2' },
  }])
  const [head, row] = csv.split('\r\n')
  expect(head).toContain('"Changed by"')
  expect(row).toContain('"System"')
  expect(row).toContain('"{""name"":""Mobile, \\""v1\\""""}"')
})
