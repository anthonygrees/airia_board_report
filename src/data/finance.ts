import type { Agent } from '../lib/airia/agents'
import type { CostRow, Finance, Window } from '../lib/airia/billing'
import { assess, TIER_ORDER, type Tier } from './inventory'

/**
 * Financial visibility: what AI costs, and how much of it can be explained.
 *
 * "Reconciled" is the measure a finance committee will ask about. Spend that
 * traces to an agent in today's inventory can be reconciled to a workflow
 * and an owner. Gateway traffic, retired agents and testing cannot — so the
 * quarter's spend is split into exactly those buckets and they sum to the
 * total.
 */

export type Bucket = 'agents' | 'unlisted' | 'gateway' | 'testing' | 'ingestion' | 'other'

export const BUCKETS: readonly Bucket[] = ['agents', 'unlisted', 'gateway', 'testing', 'ingestion', 'other']

export const BUCKET_LABEL: Record<Bucket, string> = {
  agents: 'Current agents',
  unlisted: 'Not in inventory',
  gateway: 'Gateway traffic',
  testing: 'Build & test',
  ingestion: 'Data ingestion',
  other: 'Other',
}

export const BUCKET_NOTE: Record<Bucket, string> = {
  agents: 'Traces to an agent in the inventory',
  unlisted: 'Billed to an agent the inventory does not list: deleted, or a system agent',
  gateway: 'Calls through an AI gateway, not tied to an agent',
  testing: 'Playground and builder runs',
  ingestion: 'Embedding documents into data sources',
  other: 'Any other source',
}

export interface AgentCost {
  row: CostRow
  agent: Agent | null
  tier: Tier | null
  bucket: Bucket
}

export interface FinanceSummary {
  windows: Window[]
  now: Window
  previous: Window | null
  /** Change in the latest 30 days against the 30 before, or null with no base. */
  change: number | null
  costPerExecution: number | null
  quarter: Finance['quarter']
  byBucket: { bucket: Bucket; cost: number }[]
  /** Share of the quarter that reconciles to a current agent. */
  reconciled: number
  /** Agents with spend this quarter, biggest first. */
  perAgent: AgentCost[]
  /** Average quarter spend per current agent that had any. */
  averagePerAgent: number | null
  byTier: { tier: Tier; cost: number; agents: number }[]
}

function bucketOf(row: CostRow, known: boolean): Bucket {
  switch (row.source) {
    case 'Pipeline': return known ? 'agents' : 'unlisted'
    case 'Gateway': return 'gateway'
    case 'Playground': return 'testing'
    case 'Datasource': return 'ingestion'
    default: return 'other'
  }
}

export function summariseFinance(f: Finance, agents: readonly Agent[]): FinanceSummary {
  const index = new Map<string, Agent>()
  for (const a of agents) index.set(a.id, a)
  // Billing names a pipeline by the id the agent was built with, which the
  // inventory carries as `internalId` for Airia-hosted agents.
  for (const a of agents) if (a.internalId) index.set(a.internalId, a)

  const costed: AgentCost[] = f.rows.map((row) => {
    const agent = row.pipelineId ? index.get(row.pipelineId) ?? null : null
    return { row, agent, tier: agent ? assess(agent).tier : null, bucket: bucketOf(row, agent != null) }
  })

  const totals = new Map<Bucket, number>()
  for (const c of costed) totals.set(c.bucket, (totals.get(c.bucket) ?? 0) + c.row.cost)
  const total = f.quarter.cost
  const byBucket = BUCKETS.map((bucket) => ({ bucket, cost: totals.get(bucket) ?? 0 })).filter((b) => b.cost > 0)

  // Per agent: one line per inventory agent (an agent can appear as several
  // billing rows), plus retired ones as their own rows.
  const merged = new Map<string, AgentCost>()
  for (const c of costed) {
    if (c.bucket !== 'agents' && c.bucket !== 'unlisted') continue
    const key = c.agent?.id ?? c.row.pipelineId ?? `${c.row.name}:${merged.size}`
    const have = merged.get(key)
    if (have) {
      have.row = {
        ...have.row,
        executions: have.row.executions + c.row.executions,
        cost: have.row.cost + c.row.cost,
        models: [...have.row.models, ...c.row.models],
      }
    } else merged.set(key, { ...c, row: { ...c.row } })
  }
  const perAgent = [...merged.values()].sort((a, b) => b.row.cost - a.row.cost)

  const live = perAgent.filter((c) => c.bucket === 'agents')
  const tierCost = new Map<Tier, { cost: number; agents: number }>()
  for (const c of live) {
    const t = c.tier ?? 'low'
    const x = tierCost.get(t) ?? { cost: 0, agents: 0 }
    x.cost += c.row.cost
    x.agents++
    tierCost.set(t, x)
  }

  const now = f.windows[f.windows.length - 1]
  const previous = f.windows.length > 1 ? f.windows[f.windows.length - 2] : null
  return {
    windows: f.windows,
    now,
    previous,
    change: previous && previous.cost > 0 ? (now.cost - previous.cost) / previous.cost : null,
    costPerExecution: now.executions > 0 ? now.cost / now.executions : null,
    quarter: f.quarter,
    byBucket,
    reconciled: total > 0 ? (totals.get('agents') ?? 0) / total : 0,
    perAgent,
    averagePerAgent: live.length ? live.reduce((s, c) => s + c.row.cost, 0) / live.length : null,
    byTier: TIER_ORDER.filter((t) => tierCost.has(t)).map((tier) => ({ tier, ...tierCost.get(tier)! })),
  }
}
