import type { Incidents } from '../lib/airia/incidents'
import { INCIDENT_DAYS } from '../lib/airia/incidents'
import type { AuditEvent } from '../lib/airia/audit'
import type { Control } from './security'

/**
 * Incidents and near-misses, as far as the platform can evidence them.
 *
 * The readiness table is the heart of it: it lists what an auditor or a
 * director would ask for after an incident, and says for each whether Airia
 * has it, lacks it, or cannot tell. "Unknown" is used where the platform
 * holds no record at all — which is not the same as "none happened".
 */

export const OP_LABEL: Record<string, string> = {
  AuthenticationFailure: 'Failed sign-in',
  PolicyViolation: 'Policy violation',
  DlpViolation: 'Data-loss violation',
  AnomalyDetected: 'Anomaly detected',
  SessionTermination: 'Session terminated',
  Impersonate: 'Impersonation',
}

const WEEK = 7 * 24 * 3_600_000
export const INCIDENT_WEEKS = Math.ceil(INCIDENT_DAYS / 7)

/** Names enough to follow up on, not enough to expose: `a***@example.com`. */
export const redact = (s: string): string =>
  s.replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1***@$2')

export interface LogRow {
  event: AuditEvent
  label: string
  /** Redacted, so a board pack does not carry personal addresses. */
  what: string
}

export interface IncidentSummary {
  events: number
  truncated: boolean
  critical: number
  weekly: { from: number; count: number }[]
  byType: { type: string; label: string; count: number }[]
  log: LogRow[]
  nearMissesStopped: number | null
  readiness: Control[]
  raw: Incidents
}

const n = (x: number) => x.toLocaleString()

export function summariseIncidents(i: Incidents, now = Date.now()): IncidentSummary {
  const events = i.events?.events ?? []
  const weekly = Array.from({ length: INCIDENT_WEEKS }, (_, k) => ({ from: now - (INCIDENT_WEEKS - k) * WEEK, count: 0 }))
  const types = new Map<string, number>()
  for (const e of events) {
    const w = Math.min(INCIDENT_WEEKS - 1, Math.floor((e.at - weekly[0].from) / WEEK))
    if (w >= 0) weekly[w].count++
    types.set(e.operation, (types.get(e.operation) ?? 0) + 1)
  }

  const r: Control[] = []
  if (i.runbooks) {
    r.push({
      control: 'Response playbooks defined',
      posture: i.runbooks.active > 0 ? 'In place' : 'Gap',
      detail: `${n(i.runbooks.total)} ${i.runbooks.total === 1 ? 'runbook' : 'runbooks'} defined, ${n(i.runbooks.active)} active`,
      why: 'A playbook that does not exist cannot be followed under pressure.',
    })
  }
  if (i.runs) {
    r.push({
      control: 'Playbooks exercised',
      posture: i.runs.total > 0 ? 'In place' : 'Gap',
      detail: i.runs.total > 0 ? `${n(i.runs.total)} runbook ${i.runs.total === 1 ? 'run' : 'runs'} on record` : 'No runbook has ever run, live or as a test',
      why: 'An untested playbook is a hope, not a control.',
    })
  }
  if (i.tools) {
    r.push({
      control: 'Near-misses stopped',
      posture: i.tools.blocked > 0 ? 'Partial' : 'Unknown',
      detail: `${n(i.tools.blocked)} agent actions blocked of ${n(i.tools.total)}; ${n(i.tools.audited)} only logged`,
      why: 'A blocked action never became an incident. One only logged cannot be undone.',
    })
  }
  if (i.threats != null) {
    r.push({
      control: 'Threat detection on discovered agents',
      posture: 'Unknown',
      detail: `${n(i.threats)} threat-detection events recorded`,
      why: 'Zero can mean a quiet estate or a detector with nothing connected.',
    })
  }
  if (i.remediations) {
    r.push({
      control: 'Endpoint remediations applied',
      posture: i.remediations.total === 0 ? 'Unknown' : i.remediations.applied >= i.remediations.total ? 'In place' : 'Partial',
      detail: `${n(i.remediations.applied)} of ${n(i.remediations.total)} corrective actions applied on devices`,
      why: 'Detection that does not lead to a fix only moves the risk onto a list.',
    })
  }
  if (i.exposures) {
    const open = Math.max(0, i.exposures.total - i.exposures.remediated)
    r.push({
      control: 'Exposures still open',
      posture: open === 0 ? 'In place' : 'Gap',
      detail: `${n(open)} of ${n(i.exposures.total)} credential exposures not yet remediated`,
      why: 'An exposed key is an incident waiting for someone to find it.',
    })
  }
  r.push({
    control: 'Time to remediate',
    posture: 'Unknown',
    detail: 'Not measurable: Airia records events, not their resolution',
    why: 'Has to come from the ticketing or security-operations system.',
  })
  r.push({
    control: 'Tabletop exercises and lessons learned',
    posture: 'Unknown',
    detail: 'Not recorded in Airia',
    why: 'Evidence the response was rehearsed, and what changed, is what a regulator asks for first.',
  })

  return {
    events: i.events?.total ?? 0,
    truncated: i.events?.truncated ?? false,
    critical: events.filter((e) => e.severity === 'Critical').length,
    weekly,
    byType: [...types].map(([type, count]) => ({ type, label: OP_LABEL[type] ?? type, count })).sort((a, b) => b.count - a.count),
    log: [...events].sort((a, b) => b.at - a.at).map((event) => ({
      event, label: OP_LABEL[event.operation] ?? event.operation, what: redact(event.description || event.resource),
    })),
    nearMissesStopped: i.tools ? i.tools.blocked : null,
    readiness: r,
    raw: i,
  }
}
