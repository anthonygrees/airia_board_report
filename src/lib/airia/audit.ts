import type { Connection } from './endpoint'
import { getJson } from './http'

/**
 * Who did what, and when — from `GET /v1/AuditLog/entries`.
 *
 * The log is large (a busy tenant writes thousands of entries a quarter,
 * mostly system file uploads), so the page asks the server for only the
 * resource types and operations a board cares about, and pages through at
 * most `MAX_PAGES` of them. `truncated` says when that was not everything,
 * so a count is never presented as complete when it is not.
 */

const PAGE_SIZE = 100          // the API's ceiling
const MAX_PAGES = 10

export interface AuditEvent {
  id: string
  at: number
  /** A person's name, or `System` / `Anonymous` for automated entries. */
  actor: string
  actorType: string
  role: string | null
  operation: string
  resource: string
  resourceType: string
  description: string
  severity: string
  success: boolean
}

export interface AuditFeed {
  events: AuditEvent[]
  /** What the server holds for this filter. */
  total: number
  truncated: boolean
}

export interface AuditQuery {
  resourceTypes: readonly string[]
  operations: readonly string[]
}

type Raw = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function toEvent(r: Raw): AuditEvent | null {
  const id = str(r.id)
  const seconds = Number((r.timestamp as { seconds?: unknown } | null)?.seconds)
  if (!id || !Number.isFinite(seconds)) return null
  const actor = (r.actor ?? {}) as Raw
  const resource = (r.resource ?? {}) as Raw
  return {
    id,
    at: seconds * 1000,
    actor: str(actor.name) ?? str(actor.email) ?? 'Unknown',
    actorType: str(actor.type) ?? 'Unknown',
    role: str(actor.role),
    operation: str(r.operation) ?? 'Unknown',
    resource: str(resource.name) ?? 'Unnamed',
    resourceType: str(resource.type) ?? 'Other',
    description: str(r.description) ?? '',
    severity: str(r.severity) ?? 'Low',
    success: r.success !== false,
  }
}

export async function fetchAudit(conn: Connection, q: AuditQuery, days: number, signal?: AbortSignal): Promise<AuditFeed> {
  const end = new Date(Date.now() + 24 * 3_600_000)
  const start = new Date(Date.now() - days * 24 * 3_600_000)
  const events: AuditEvent[] = []
  let total = 0

  for (let page = 1; page <= MAX_PAGES; page++) {
    const p = new URLSearchParams({
      Page: String(page), PageSize: String(PAGE_SIZE), IncludeTotalCount: 'true',
      StartDate: start.toISOString(), EndDate: end.toISOString(),
    })
    q.resourceTypes.forEach((t) => p.append('ResourceTypes', t))
    q.operations.forEach((o) => p.append('Operations', o))
    const body = await getJson<{ entries?: Raw[]; totalCount?: number; hasMore?: boolean }>(
      conn, `/v1/AuditLog/entries?${p}`, signal,
    )
    const entries = body.entries ?? []
    total = body.totalCount ?? total
    for (const r of entries) {
      const e = toEvent(r)
      if (e) events.push(e)
    }
    if (entries.length < PAGE_SIZE || body.hasMore === false) break
  }
  return { events, total: Math.max(total, events.length), truncated: total > events.length }
}

/** Creating, publishing, deploying and removing agents. */
export const LIFECYCLE: AuditQuery = {
  resourceTypes: ['Pipeline', 'Agent', 'Deployment'],
  operations: ['Create', 'Publish', 'SetActiveVersion', 'Delete'],
}

/** Granting the access agents and people act with. */
export const ACCESS: AuditQuery = {
  resourceTypes: ['ApiKey', 'Credential', 'AccessControl', 'Group', 'User'],
  operations: ['Create', 'Delete', 'Grant', 'Revoke', 'RoleAssigned', 'RoleRevoked', 'RoleChanged', 'PermissionGranted', 'PermissionRevoked'],
}

export const AUDIT_DAYS = 90
