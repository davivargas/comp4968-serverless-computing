import assert from 'node:assert/strict'
import { createServer } from 'vite'

// Use Vite's loader so tests exercise the same TypeScript mock as the browser.
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}
const server = await createServer({ server: { middlewareMode: true } })
try {
  const { mockApi: api } = await server.ssrLoadModule('/src/lib/manager/mock.ts')
  const period = { from: '2026-11-09', to: '2026-11-22' }
  const initial = await api.listTimesheets({ status: 'pending', limit: 2 })
  assert.equal(initial.timesheets.length, 2)
  assert.ok(initial.timesheets.every(t => t.submitted && !t.approved))
  assert.ok(initial.timesheets[0].date >= initial.timesheets[1].date)
  const page = await api.listTimesheets({ status: 'pending', limit: 2, offset: 2 })
  assert.ok(page.timesheets.every(t => !initial.timesheets.some(x => x.timesheetId === t.timesheetId)))

  await assert.rejects(api.reviewPeriod('E1003', 'approve', period), /every entry/)
  await assert.rejects(api.reviewPeriod('E1001', 'approve', { from: '2026-11-09', to: '2026-11-10' }), /complete biweekly/)
  const approved = await api.reviewPeriod('E1001', 'approve', period)
  assert.equal(approved.entries.length, 3)
  assert.ok(approved.entries.every(t => t.submitted && t.approved))
  const rejected = await api.reviewPeriod('E1001', 'reject', period)
  assert.ok(rejected.entries.every(t => !t.submitted && !t.approved))
  await assert.rejects(api.reviewPeriod('E1001', 'reject', period), /requires submitted/)

  const project = await api.createProject({ name: 'Test project' })
  assert.equal(project.projectCode, 301)
  await assert.rejects(api.createProject({ name: 'Duplicate', projectCode: 301 }), /already used/)
  await assert.rejects(api.assignEmployee(project.projectId, 'E1005'), /active team member/)
  assert.equal((await api.assignEmployee(project.projectId, 'E1001')).alreadyAssigned, false)
  assert.equal((await api.assignEmployee(project.projectId, 'E1001')).alreadyAssigned, true)
  assert.equal((await api.projectEmployees(project.projectId)).employees.length, 1)
  assert.equal((await api.listEmployees(project.projectId)).length, 1)
  await assert.rejects(api.updateProject(project.projectId, { isDeleted: true }), /in use/)
  await api.updateProject(project.projectId, { status: 'CLOSED' })
  await assert.rejects(api.assignEmployee(project.projectId, 'E1003'), /Closed projects/)
  const disposable = await api.createProject({ name: 'Disposable', projectCode: 900 })
  await api.updateProject(disposable.projectId, { isDeleted: true })
  assert.ok(!(await api.listProjects()).some(p => p.projectId === disposable.projectId))
  await assert.rejects(api.createProject({ name: 'Reuse', projectCode: 900 }), /already used/)
  assert.ok(storage.has('mock.manager.v1'))
  console.log('Manager checks passed: filtering, pagination, period reviews, project lifecycle, assignments, and persistence.')
} finally {
  await server.close()
}
