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
  const { loadPeriodEntries, summarizePeriod } = await server.ssrLoadModule('/src/lib/manager/timesheets.ts')
  const period = { from: '2026-11-09', to: '2026-11-22' }
  const complete = await api.listTimesheets({ ...period })
  const offsets = []
  const allEntries = await loadPeriodEntries({
    async listTimesheets(query) {
      offsets.push(query.offset)
      assert.equal(query.status, undefined, 'Summaries must include every entry status')
      return { timesheets: complete.timesheets.slice(query.offset, query.offset + 2), limit: 2, offset: query.offset }
    },
  }, period)
  assert.deepEqual(offsets, [0, 2, 4, 6])
  assert.equal(allEntries.length, 6, 'Do not summarize only the first API page')
  const summaries = summarizePeriod(allEntries)
  assert.equal(summaries.length, 2)
  const alex = summaries.find(s => s.employeeId === 'E1001')
  const carol = summaries.find(s => s.employeeId === 'E1003')
  assert.equal(alex.hours, 24)
  assert.equal(alex.days, 3)
  assert.equal(alex.status, 'Pending')
  assert.equal(alex.canApprove, true)
  assert.equal(carol.status, 'Partially submitted')
  assert.equal(carol.canApprove, false)
  assert.equal(carol.canReturn, true)
  assert.ok(alex.entries.every((e, i, rows) => !i || e.date >= rows[i - 1].date))
  const sameDay = summarizePeriod([allEntries[0], { ...allEntries[0], timesheetId: 'extra', startTime: '17:00', endTime: '18:00' }])[0]
  assert.equal(sameDay.days, 1)
  assert.equal(sameDay.hours, 9)
  assert.equal(summarizePeriod(allEntries.map(e => ({ ...e, submitted: true, approved: true })))[0].status, 'Approved')
  assert.equal(summarizePeriod(allEntries.map(e => ({ ...e, submitted: false, approved: false })))[0].status, 'Unsubmitted')
  assert.deepEqual(summarizePeriod([]), [])
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
  assert.equal((await api.listEmployees('E1002', project.projectId)).length, 1)
  await assert.rejects(api.updateProject(project.projectId, { isDeleted: true }), /in use/)
  await api.updateProject(project.projectId, { status: 'CLOSED' })
  await assert.rejects(api.assignEmployee(project.projectId, 'E1003'), /Closed projects/)
  await api.removeEmployee(project.projectId, 'E1001')
  assert.equal((await api.projectEmployees(project.projectId)).employees.length, 0)
  assert.equal((await api.listProjects()).find(p => p.projectId === project.projectId).employeeCount, 0)
  await assert.rejects(api.removeEmployee(project.projectId, 'E1001'), /not assigned/)
  await assert.rejects(api.removeEmployee('missing', 'E1001'), /not found/)
  const history = await api.listTimesheets()
  await api.removeEmployee('P100', 'E1001')
  assert.deepEqual(await api.listTimesheets(), history, 'Removing assignment must preserve historical timesheets and review flags')
  const disposable = await api.createProject({ name: 'Disposable', projectCode: 900 })
  await api.updateProject(disposable.projectId, { isDeleted: true })
  assert.ok(!(await api.listProjects()).some(p => p.projectId === disposable.projectId))
  await assert.rejects(api.createProject({ name: 'Reuse', projectCode: 900 }), /already used/)
  assert.ok(storage.has('mock.manager.v1'))
  console.log('Manager checks passed: complete-period summaries, pagination, review guards, project lifecycle, assignments, and persistence.')
} finally {
  await server.close()
}
