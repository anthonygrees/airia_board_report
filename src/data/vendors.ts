import type { Agent } from '../lib/airia/agents'
import type { Finance } from '../lib/airia/billing'
import type { Discovery } from '../lib/airia/discovery'

/**
 * Third-party and vendor risk, from what the platform can see.
 *
 * Airia holds no vendor security ratings and no questionnaire results, so a
 * rating trend cannot come from here. What it does hold is the supply chain
 * itself: which model vendors the spend goes to, which models and tools
 * agents depend on, whether those models are being retired, and how much of
 * the third-party estate is connected and under control. Concentration and
 * dependency are what turn a vendor's outage or deprecation into the
 * organisation's own incident.
 */

export interface VendorSpend {
  vendor: string
  cost: number
  /** Share of ALL spend in the period, not of the spend that names a model. */
  share: number
  models: string[]
  /** False for the remainder that carries no model, so it names no vendor. */
  attributed: boolean
}
export interface Dependency { name: string; agents: number }

export interface VendorSummary {
  spend: VendorSpend[]
  topVendor: VendorSpend | null
  vendors: number
  models: Dependency[]
  tools: Dependency[]
  /** Airia-built agents, the denominator for how many rely on a model or tool. */
  agentCount: number
  overdueModels: number
  spendAtRisk: number
  d: Discovery
}

function dependencies(agents: readonly Agent[], pick: (a: Agent) => string[]): Dependency[] {
  const counts = new Map<string, number>()
  for (const a of agents) for (const name of new Set(pick(a))) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts].map(([name, n]) => ({ name, agents: n })).sort((a, b) => b.agents - a.agents || a.name.localeCompare(b.name))
}

export function summariseVendors(d: Discovery, finance: Finance | null, agents: readonly Agent[]): VendorSummary {
  const byVendor = new Map<string, { cost: number; models: Set<string> }>()
  for (const row of finance?.rows ?? []) {
    for (const m of row.models) {
      const vendor = m.provider || 'Unknown'
      const v = byVendor.get(vendor) ?? { cost: 0, models: new Set<string>() }
      v.cost += m.cost
      v.models.add(m.name)
      byVendor.set(vendor, v)
    }
  }
  // Gateway traffic is billed with no model breakdown, so it names no vendor. Leaving it out
  // would make every vendor's share look larger than it is, so it is carried as its own line
  // and the shares are of the real total.
  const named = [...byVendor.values()].reduce((s, v) => s + v.cost, 0)
  const total = Math.max(finance?.quarter.cost ?? 0, named)
  const spend: VendorSpend[] = [...byVendor].map(([vendor, v]) => ({
    vendor, cost: v.cost, share: total > 0 ? v.cost / total : 0, models: [...v.models].sort(), attributed: true,
  }))
  const rest = total - named
  if (total > 0 && rest > total * 0.005) {
    spend.push({ vendor: 'Not attributed to a vendor', cost: rest, share: rest / total, models: [], attributed: false })
  }
  spend.sort((a, b) => b.cost - a.cost)

  const list = d.deprecation?.list ?? []
  return {
    spend,
    topVendor: spend.find((v) => v.attributed) ?? null,
    vendors: spend.filter((v) => v.attributed).length,
    models: dependencies(agents, (a) => a.models),
    tools: dependencies(agents, (a) => a.tools),
    agentCount: agents.filter((a) => !a.external).length,
    overdueModels: list.filter((m) => m.status === 'overdue').length,
    spendAtRisk: list.reduce((s, m) => s + m.spend, 0),
    d,
  }
}
