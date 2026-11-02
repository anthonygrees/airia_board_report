import type { Agent } from '../lib/airia/agents'
import type { AuditEvent, AuditFeed } from '../lib/airia/audit'
import { AUDIT_DAYS } from '../lib/airia/audit'
import { assess, type Assessed } from './inventory'

/**
 * Accountability: who owns each agent, and who changed what.
 *
 * Two sources meet here. The inventory says who OWNS an agent; the audit log
 * says who ACTED on one. A board wants both, and wants to know where they
 * disagree — an agent that acts, that people keep changing, that nobody owns.
 */

export type Change = 'Created' | 'Published' | 'Deployed' | 'Withdrawn' | 'Deleted'
export const CHANGES: readonly Change[] = ['Created', 'Published', 'Deployed', 'Withdrawn', 'Deleted']

/** What an audit entry means for an agent's life. Null if it is not one. */
export function changeOf(e: AuditEvent): Change | null {
  const deployment = e.resourceType === 'Deployment'
  switch (e.operation) {
    case 'Create': return deployment ? 'Deployed' : 'Created'
    case 'Publish':
    case 'SetActiveVersion': return 'Published'
    case 'Delete': return deployment ? 'Withdrawn' : 'Deleted'
    default: return null
  }
}

const WEEK = 7 * 24 * 3_600_000
export const WEEKS = Math.ceil(AUDIT_DAYS / 7)

export interface Owner { name: string; agents: number; executive: number }

export interface Actor {
  name: string
  role: string | null
  counts: Record<Change, number>
  total: number
  last: number
}

export interface AccountabilitySummary {
  agents: number
  owned: number
  /** Agents that act (tools / MCP) and have no owner: the sharpest gap. */
  executiveUnowned: number
  owners: Owner[]
  /** Unowned agents that can act, worst tier first, for the review list. */
  unowned: Assessed[]
  changes: number
  changesTruncated: boolean
  byChange: Record<Change, number>
  /** Changes per 7-day bucket, oldest first, ending now. */
  weekly: { from: number; count: number }[]
  /** Access changes per 7-day bucket, on the same weeks. */
  accessWeekly: { from: number; count: number }[]
  actors: Actor[]
  /** People (not System / Anonymous) behind the changes. */
  people: number
  /** Share of changes attributed to a named person. */
  attributed: number
  /** The log itself, newest first. */
  log: AuditEvent[]
  access: { events: AuditEvent[]; total: number; truncated: boolean }
}

export function summariseAccountability(
  agents: readonly Agent[], lifecycle: AuditFeed, access: AuditFeed, now = Date.now(),
): AccountabilitySummary {
  const assessed = agents.map(assess)

  const owners = new Map<string, Owner>()
  let owned = 0, executiveUnowned = 0
  const unowned: Assessed[] = []
  for (const s of assessed) {
    if (s.agent.owner) {
      owned++
      const o = owners.get(s.agent.owner) ?? { name: s.agent.owner, agents: 0, executive: 0 }
      o.agents++
      if (s.authority === 'executive') o.executive++
      owners.set(s.agent.owner, o)
    } else if (s.authority === 'executive') {
      executiveUnowned++
      unowned.push(s)
    }
  }
  const tierRank = (s: Assessed) => ['high', 'elevated', 'moderate', 'low', 'unassessed'].indexOf(s.tier)
  unowned.sort((a, b) => tierRank(a) - tierRank(b) || (b.agent.executions ?? 0) - (a.agent.executions ?? 0))

  const byChange = Object.fromEntries(CHANGES.map((c) => [c, 0])) as Record<Change, number>
  const weekly = Array.from({ length: WEEKS }, (_, i) => ({ from: now - (WEEKS - i) * WEEK, count: 0 }))
  const accessWeekly = weekly.map((w) => ({ from: w.from, count: 0 }))
  for (const e of access.events) {
    const w = Math.min(WEEKS - 1, Math.floor((e.at - weekly[0].from) / WEEK))
    if (w >= 0) accessWeekly[w].count++
  }
  const actors = new Map<string, Actor>()
  const log: AuditEvent[] = []
  let attributed = 0

  for (const e of lifecycle.events) {
    const c = changeOf(e)
    if (!c) continue
    log.push(e)
    byChange[c]++
    const w = Math.min(WEEKS - 1, Math.floor((e.at - weekly[0].from) / WEEK))
    if (w >= 0) weekly[w].count++
    const person = e.actorType === 'User'
    if (person) {
      attributed++
      const a = actors.get(e.actor) ?? {
        name: e.actor, role: e.role, last: 0, total: 0,
        counts: Object.fromEntries(CHANGES.map((k) => [k, 0])) as Record<Change, number>,
      }
      a.counts[c]++
      a.total++
      a.last = Math.max(a.last, e.at)
      actors.set(e.actor, a)
    }
  }
  log.sort((a, b) => b.at - a.at)

  return {
    agents: assessed.length,
    owned,
    executiveUnowned,
    owners: [...owners.values()].sort((a, b) => b.agents - a.agents || a.name.localeCompare(b.name)),
    unowned,
    changes: log.length,
    changesTruncated: lifecycle.truncated,
    byChange,
    weekly,
    accessWeekly,
    actors: [...actors.values()].sort((a, b) => b.total - a.total),
    people: actors.size,
    attributed: log.length ? attributed / log.length : 1,
    log,
    access: { events: [...access.events].sort((a, b) => b.at - a.at), total: access.total, truncated: access.truncated },
  }
}
