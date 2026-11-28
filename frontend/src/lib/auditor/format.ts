import type { AuditLogEntry } from './types'

const BC = 'America/Vancouver'

/** Today as YYYY-MM-DD in BC time, the zone the backend's date filters use. */
export const todayBC = () => new Date().toLocaleDateString('en-CA', { timeZone: BC })

/** YYYY-MM-DD `days` before the given YYYY-MM-DD. */
export function daysBefore(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
}

export function formatTimestamp(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' }
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: BC, dateStyle: 'medium' }),
    time: d.toLocaleTimeString('en-CA', { timeZone: BC, hour: 'numeric', minute: '2-digit', second: '2-digit' }),
  }
}

/** "timesheet_entry" → "Timesheet entry". */
export const humanize = (key: string) => {
  const words = key.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function displayValue(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const actorName = (e: AuditLogEntry) => e.changedByName || (e.changedBy == null ? 'System' : `Employee ${e.changedBy}`)

/** Every field touched by the change, with its value before and after (undefined = not part of that side). */
export function changedFields(e: AuditLogEntry) {
  const before = e.oldValues ?? {}
  const after = e.newValues ?? {}
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map((field) => ({
    field,
    before: field in before ? before[field] : undefined,
    after: field in after ? after[field] : undefined,
  }))
}

/** One-line summary for the table, e.g. "Status: SUBMITTED → APPROVED" or "3 fields". */
export function changeSummary(e: AuditLogEntry) {
  const fields = changedFields(e)
  if (fields.length === 0) return 'No field details'
  if (fields.length > 1) return `${fields.length} fields: ${fields.map((f) => humanize(f.field).toLowerCase()).join(', ')}`
  const { field, before, after } = fields[0]
  if (e.action === 'UPDATE' && before !== undefined && after !== undefined) return `${humanize(field)}: ${displayValue(before)} → ${displayValue(after)}`
  return `${humanize(field)}: ${displayValue(after ?? before)}`
}

const csvCell = (v: unknown) => `"${displayValue(v).replaceAll('"', '""')}"`

/** The loaded entries as a CSV file the auditor can keep as evidence. */
export function toCsv(entries: AuditLogEntry[]) {
  const head = ['Audit ID', 'Changed at (UTC)', 'Action', 'Table', 'Record ID', 'Changed by ID', 'Changed by', 'Old values', 'New values']
  const rows = entries.map((e) => [e.auditId, e.changedAt, e.action, e.table, e.recordId, e.changedBy, actorName(e), e.oldValues, e.newValues])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}
