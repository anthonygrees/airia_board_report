import { useMemo } from 'react'
import { Card, RankTable, StatTile, TableView } from '../components'
import { series } from '../theme/palette'
import { full, percent } from '../lib/format'
import type { Agent } from '../lib/airia/agents'
import {
  TIER_LABEL, TIER_ORDER, TIER_RULE, growth, summarise,
  type Assessed, type Scope, type Summary,
} from '../data/inventory'
import { SummaryCard, Trend, dayYear, plural, ReviewAndMitigate } from './shared'
import { inventoryActions } from '../data/guidance'

export const SCOPES = [
  { key: 'all', label: 'All agents' },
  { key: 'active', label: 'In use' },
] as const

/** A share that is small but real reads "<1%", never "0%". */
const pct = (n: number, of: number) => (of <= 0 ? '—' : n > 0 && n / of < 0.01 ? '<1%' : percent(n / of, 0))

/** What an agent can touch, in words: "3 tools · 2 data sources". */
export function reachText(s: Assessed): string {
  const parts: string[] = []
  if (s.reach.tools) parts.push(plural(s.reach.tools, 'tool'))
  if (s.reach.gateways) parts.push(plural(s.reach.gateways, 'MCP gateway', 'MCP gateways'))
  if (s.reach.data) parts.push(plural(s.reach.data, 'data source'))
  return parts.length ? parts.join(' · ') : s.agent.external ? 'Not visible' : 'Model only'
}

/**
 * What a reviewer should do about this agent, from the gaps it actually has.
 * Said as actions, not findings, so the list reads as a to-do rather than a charge sheet.
 */
function toReview(r: Assessed): string {
  const a = r.agent
  const todo: string[] = []
  if (a.external && r.tier === 'unassessed') todo.push('Find out what it can access')
  if (!a.owner) todo.push('Assign an owner')
  if (r.reach.tools + r.reach.gateways > 0) todo.push('Check its tools')
  if (r.reach.data > 0) todo.push('Check its data access')
  if (!a.classified) todo.push('Classify its risk')
  if (a.useCaseCount === 0) todo.push('Link to a use case')
  return todo.length ? todo.join(' · ') : 'Nothing outstanding'
}

/** The one sentence a director should leave with. */
function headline(s: Summary) {
  if (s.total === 0) return <span>No agents found in this tenant.</span>
  return (
    <span>
      <strong>{plural(s.executive, 'agent')}</strong> can act on company systems, not just answer questions.{' '}
      {s.executiveNoOwner > 0
        ? <><strong>{full(s.executiveNoOwner)}</strong> of them {s.executiveNoOwner === 1 ? 'has' : 'have'} no named owner.</>
        : <>Every one has a named owner.</>}
    </span>
  )
}

/** Overview card: the size of the estate, and how fast it has grown. */
export function InventorySummary({ agents }: { agents: readonly Agent[] }) {
  const s = useMemo(() => summarise(agents, 'all'), [agents])
  const g = useMemo(() => growth(agents), [agents])
  return (
    <SummaryCard
      to="inventory"
      title="AI agent inventory"
      value={full(s.total)}
      valueSuffix="agents in inventory"
      line={<><strong>{full(s.executive)}</strong> can act on company systems · <strong>{full(s.byTier.high)}</strong> are high risk</>}
    >
      <Trend
        x={g.map((p) => p.at)} values={g.map((p) => p.count)} color={series(1)} label="Agents"
        formatValue={full} formatX={dayYear} height={150}
      />
    </SummaryCard>
  )
}

/**
 * Detail page — AI agent inventory and risk classification.
 *
 * Answers, in order: how many agents are there, which of them can act rather
 * than advise, how are they tiered, who owns them, and which should the
 * board's risk owner look at first.
 */
export function InventoryPanel({ agents, scope }: { agents: readonly Agent[]; scope: Scope }) {
  const s = useMemo(() => summarise(agents, scope), [agents, scope])

  const tierRows = TIER_ORDER.filter((t) => s.byTier[t] > 0).map((t) => ({
    key: t,
    label: TIER_LABEL[t],
    value: s.byTier[t],
    detail: [
      { label: 'How it is decided', value: TIER_RULE[t] },
      { label: 'Can act on systems', value: full(s.tierDetail[t].executive) },
      { label: 'No named owner', value: full(s.tierDetail[t].noOwner) },
    ],
  }))

  const platformRows = s.byPlatform.map((p) => ({
    key: p.platform,
    label: p.platform,
    value: p.count,
    detail: [{ label: 'Share of agents', value: pct(p.count, s.total) }],
  }))

  const review = {
    columns: [
      { key: 'agent', label: 'Agent' },
      { key: 'tier', label: 'Risk tier', align: 'left' as const },
      { key: 'can', label: 'Can', align: 'left' as const },
      { key: 'reach', label: 'Reaches', align: 'left' as const },
      { key: 'owner', label: 'Owner', align: 'left' as const },
      { key: 'runs', label: 'Runs', align: 'right' as const },
      { key: 'todo', label: 'What to review', align: 'left' as const },
    ],
    rows: s.ranked.map((r) => ({
      agent: r.agent.name,
      tier: TIER_LABEL[r.tier],
      can: r.authority === 'executive' ? 'Act' : 'Advise',
      reach: reachText(r),
      owner: r.agent.owner ?? 'No owner',
      runs: r.agent.executions == null ? '—' : full(r.agent.executions),
      todo: toReview(r),
    })),
  }

  return (
    <>
      <div className="strip">
        <StatTile label="Agents" value={full(s.total)} />
        <StatTile label="Can act on systems" value={full(s.executive)} />
        <StatTile label="High risk" value={full(s.byTier.high)} />
        <StatTile label="Have a named owner" value={pct(s.total - s.noOwner, s.total)} />
        <StatTile label="Risk-classified" value={pct(s.classified, s.total)} />
        <StatTile label="In a governed use case" value={pct(s.linkedToUseCase, s.total)} />
      </div>

      <p className="page__scope">{headline(s)}</p>

      <div className="grid">
        <div className="grid__wide">
          <Card title="Risk tier" value={full(s.total)} valueSuffix={scope === 'active' ? 'agents in use' : 'agents'}
            footer={<>Derived from what an agent can do (tools, MCP gateways) and reach (data sources). Hover a row for the rule.</>}>
            <RankTable rows={tierRows} labelHeading="Tier" valueHeading="Agents" showChange={false} formatValue={full} />
          </Card>
        </div>
        <div className="grid__wide">
          <Card title="Where agents run" value={full(s.byPlatform.length)} valueSuffix={s.byPlatform.length === 1 ? 'platform' : 'platforms'}
            footer={<>{s.external > 0 ? `${plural(s.external, 'agent')} run outside Airia and were found by discovery.` : 'Every agent runs inside Airia.'}</>}>
            <RankTable rows={platformRows} labelHeading="Platform" valueHeading="Agents" showChange={false} formatValue={full} />
          </Card>
        </div>
        <div className="grid__full">
          <Card
            title="Review first"
            footer={<>Highest tier first, unowned ahead of owned. "Owner" is the owner assigned in Airia's asset registry. Source: <code>GET /v1/AiAssets</code>.</>}
          >
            <div className="pn-why">
              <p>
                <strong>Why this matters.</strong> An agent that can act on company systems, reaches company data and
                has nobody answerable for it is where harm is most likely and accountability is weakest. These are
                ranked so the ones that could do the most damage are reviewed first.
              </p>
              <p>
                <strong>What to review.</strong> For each agent, in order: is there a named owner; does it need every
                tool and data source it has; and is it risk-classified and inside a governed use case. The last column
                lists what is outstanding for that agent.
              </p>
            </div>
            <div className="pn-wraplast">
              <TableView caption="Agents, highest risk first" columns={review.columns} rows={review.rows} maxHeight={420} />
            </div>
          </Card>
        </div>
        <div className="grid__full"><ReviewAndMitigate actions={inventoryActions(s)} /></div>
      </div>
    </>
  )
}
