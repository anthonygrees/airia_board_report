import type { Agent } from '../lib/airia/agents'

/**
 * Risk tiering for the board.
 *
 * Airia carries no single "risk" field per agent, so the tier is derived from
 * what an agent can DO and what it can REACH — both of which the inventory
 * reports and a director can check:
 *
 *   authority  Executive  has a tool or an MCP gateway: it can act on systems
 *              Advisory   no tools: it can only answer
 *   reach      the agent is wired to company data sources
 *
 *   High      Executive, with company data      acts on what it can read
 *   Elevated  Executive, no company data        acts, but blind to company data
 *   Moderate  Advisory, with company data       can surface what it can read
 *   Low       Advisory, model only              answers from the model alone
 *   Unassessed  discovered on another platform, with no tools or data visible —
 *               unknown, which is not the same as safe
 *
 * The rule is stated on the page beside the numbers. A tier a board cannot
 * trace to a rule is a tier it cannot challenge.
 */

export type Tier = 'high' | 'elevated' | 'moderate' | 'low' | 'unassessed'

export const TIER_ORDER: readonly Tier[] = ['high', 'elevated', 'moderate', 'low', 'unassessed']

export const TIER_LABEL: Record<Tier, string> = {
  high: 'High',
  elevated: 'Elevated',
  moderate: 'Moderate',
  low: 'Low',
  unassessed: 'Unassessed',
}

export const TIER_RULE: Record<Tier, string> = {
  high: 'Acts on systems and reaches company data',
  elevated: 'Acts on systems, no company data',
  moderate: 'Advisory, reaches company data',
  low: 'Advisory, model only',
  unassessed: 'Runs outside Airia, access not visible',
}

export type Authority = 'executive' | 'advisory'

export interface Assessed {
  agent: Agent
  authority: Authority
  tier: Tier
  /** What it can touch, in the order a director would ask. */
  reach: { tools: number; data: number; gateways: number }
}

export function assess(agent: Agent): Assessed {
  const tools = agent.tools.length
  const data = agent.dataSources.length
  const gateways = agent.mcpGateways.length
  const authority: Authority = tools + gateways > 0 ? 'executive' : 'advisory'
  const visible = tools + data + gateways > 0
  const tier: Tier =
    agent.external && !visible ? 'unassessed'
      : authority === 'executive' ? (data > 0 ? 'high' : 'elevated')
      : data > 0 ? 'moderate' : 'low'
  return { agent, authority, tier, reach: { tools, data, gateways } }
}

export type Scope = 'all' | 'active'

/** An agent that has run, or one we found running elsewhere. */
export const inUse = (a: Agent): boolean => a.external || (a.executions ?? 0) > 0

export interface Summary {
  total: number
  executive: number
  executiveNoOwner: number
  noOwner: number
  classified: number
  linkedToUseCase: number
  external: number
  withData: number
  byTier: Record<Tier, number>
  /** Per tier: how many are Executive, and how many have no owner. */
  tierDetail: Record<Tier, { executive: number; noOwner: number }>
  byPlatform: { platform: string; count: number }[]
  /** Everything, worst first, for the review list. */
  ranked: Assessed[]
}

const empty = <T,>(make: () => T): Record<Tier, T> =>
  ({ high: make(), elevated: make(), moderate: make(), low: make(), unassessed: make() })

export function summarise(agents: readonly Agent[], scope: Scope): Summary {
  const pool = scope === 'active' ? agents.filter(inUse) : agents
  const assessed = pool.map(assess)

  const byTier = empty(() => 0)
  const tierDetail = empty(() => ({ executive: 0, noOwner: 0 }))
  const platforms = new Map<string, number>()
  let executive = 0, executiveNoOwner = 0, noOwner = 0, classified = 0
  let linkedToUseCase = 0, external = 0, withData = 0

  for (const s of assessed) {
    const a = s.agent
    byTier[s.tier]++
    if (s.authority === 'executive') { executive++; tierDetail[s.tier].executive++ }
    if (!a.owner) {
      noOwner++
      tierDetail[s.tier].noOwner++
      if (s.authority === 'executive') executiveNoOwner++
    }
    if (a.classified) classified++
    if (a.useCaseCount > 0) linkedToUseCase++
    if (a.external) external++
    if (s.reach.data > 0) withData++
    platforms.set(a.platform, (platforms.get(a.platform) ?? 0) + 1)
  }

  const ranked = [...assessed].sort((x, y) =>
    TIER_ORDER.indexOf(x.tier) - TIER_ORDER.indexOf(y.tier)
    // Within a tier the unowned come first: nobody to answer for them.
    || Number(!y.agent.owner) - Number(!x.agent.owner)
    || (y.agent.executions ?? 0) - (x.agent.executions ?? 0)
    || x.agent.name.localeCompare(y.agent.name))

  return {
    total: assessed.length,
    executive, executiveNoOwner, noOwner, classified, linkedToUseCase, external, withData,
    byTier, tierDetail,
    byPlatform: [...platforms].map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count),
    ranked,
  }
}

const GROWTH_STEP = 30 * 24 * 3_600_000

/**
 * How the estate has grown: agents that existed at the end of each of the
 * last `points` 30-day periods, oldest first. An agent with no creation date
 * is counted from the start rather than dropped.
 */
export function growth(agents: readonly Agent[], points = 12, now = Date.now()): { at: number; count: number }[] {
  return Array.from({ length: points }, (_, i) => {
    const at = now - (points - 1 - i) * GROWTH_STEP
    return { at, count: agents.reduce((n, a) => n + (a.createdAt == null || a.createdAt <= at ? 1 : 0), 0) }
  })
}
