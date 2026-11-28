export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

/** One recorded change, as GET /audit/logs returns it. Values are already redacted by the backend. */
export interface AuditLogEntry {
  auditId: string
  table: string
  recordId: string
  action: AuditAction
  /** Employee ID of whoever made the change; null for system changes and auditor accounts. */
  changedBy: number | null
  changedByName: string | null
  changedAt: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}

export interface AuditLogResult {
  logs: AuditLogEntry[]
  /** Pass back to get the next (older) page; null when there is nothing more. */
  nextToken: string | null
}

/** Query for GET /audit/logs. Dates are YYYY-MM-DD in BC time; the range can be at most 366 days. */
export interface AuditLogQuery {
  from?: string
  to?: string
  table?: string
  recordId?: string
  changedBy?: string
  action?: AuditAction
  limit?: number
  nextToken?: string
}

/** GET /audit/employees result row. */
export interface EmployeeMatch {
  employeeId: string
  firstName: string
  lastName: string
  email: string
}

/** Tables the backend writes audit entries for. */
export const AUDITED_TABLES = ['employee', 'direct_deposit', 'timesheet_entry', 'team', 'project', 'project_assignment', 'auditor'] as const
