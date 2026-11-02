import type { Connection } from './endpoint'
import { fetchAudit, type AuditFeed } from './audit'
import { getJson, optional } from './http'

/**
 * What the platform can say about incidents and near-misses.
 *
 * Airia records when an event HAPPENS, not when it was resolved: there is no
 * incident object with an opened and a closed time, no tabletop exercise and
 * no lessons-learned register. So this assembles the nearest honest evidence
 * — security events in the audit log, response playbooks and whether they have
 * ever run, actions blocked before they landed, and remediations applied —
 * and the page says plainly which parts of an incident report it cannot give.
 */

export const INCIDENT_DAYS = 90

/** Audit operations that are security events rather than configuration changes. */
export const SECURITY_OPERATIONS = [
  'AuthenticationFailure', 'PolicyViolation', 'DlpViolation', 'AnomalyDetected', 'SessionTermination', 'Impersonate',
] as const

export interface Remediation { at: number; client: string; action: string; applied: boolean }

export interface Incidents {
  events: AuditFeed | null
  runbooks: { total: number; active: number } | null
  /** Runbook executions on record. */
  runs: { total: number; failed: number } | null
  threats: number | null
  tools: { blocked: number; audited: number; total: number } | null
  remediations: { total: number; applied: number; recent: Remediation[] } | null
  exposures: { total: number; remediated: number } | null
  sla: { overdue: number; approaching: number } | null
}

type Raw = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])
interface Report { metrics?: { key: string; value: unknown }[] }
const metric = (r: Report, key: string): unknown => r.metrics?.find((m) => m.key === key)?.value

export async function fetchIncidents(conn: Connection, signal?: AbortSignal): Promise<Incidents> {
  const [events, runbooks, runs, threats, guardrail, actions, exposure, sla] = await Promise.all([
    optional(fetchAudit(conn, { resourceTypes: [], operations: SECURITY_OPERATIONS }, INCIDENT_DAYS, signal)),
    optional(getJson<{ items?: Raw[]; totalCount?: number }>(conn, '/v1/security/runbooks?PageNumber=1&PageSize=100', signal)),
    optional(getJson<{ items?: Raw[]; totalCount?: number }>(conn, '/v1/security/runbooks/executions?PageNumber=1&PageSize=100', signal)),
    optional(getJson<{ totalCount?: number }>(conn, '/v1/spm/threat-detection/events?pageSize=1&includeTotalCount=true', signal)),
    optional(getJson<Report>(conn, '/v1/discovery/reports/guardrail-effectiveness', signal)),
    optional(getJson<{ items?: Raw[]; totalCount?: number }>(conn, '/v1/security/endpoints/reconcile-actions?PageNumber=1&PageSize=100', signal)),
    optional(getJson<Report>(conn, '/v1/discovery/reports/credential-exposure', signal)),
    optional(getJson<Raw>(conn, '/v1/governance/dashboard/sla-at-risk', signal)),
  ])

  const acts = arr(actions?.items)
  return {
    events,
    runbooks: runbooks ? { total: num(runbooks.totalCount), active: arr(runbooks.items).filter((r) => str(r.status) === 'active').length } : null,
    runs: runs ? { total: num(runs.totalCount), failed: arr(runs.items).filter((r) => /fail/i.test(str(r.status))).length } : null,
    threats: threats ? num(threats.totalCount) : null,
    tools: guardrail ? {
      blocked: num(metric(guardrail, 'blockedToolCallCount')),
      audited: num(metric(guardrail, 'auditedToolCallCount')),
      total: num(metric(guardrail, 'totalToolCallCount')),
    } : null,
    remediations: actions ? {
      total: Math.max(num(actions.totalCount), acts.length),
      applied: acts.filter((a) => a.applied === true).length,
      recent: acts.map((a) => ({
        at: Date.parse(str(a.occurredAt)) || 0, client: str(a.clientId), action: str(a.action), applied: a.applied === true,
      })).sort((a, b) => b.at - a.at),
    } : null,
    exposures: exposure ? { total: num(metric(exposure, 'totalExposureCount')), remediated: num(metric(exposure, 'remediatedCount')) } : null,
    sla: sla ? { overdue: num(sla.overdueCount), approaching: num(sla.approachingCount) } : null,
  }
}
