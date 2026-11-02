import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { series } from '../theme/palette'
import { full, percent } from '../lib/format'
import type { Agent } from '../lib/airia/agents'
import type { Audit } from '../data/live'
import { AUDIT_DAYS } from '../lib/airia/audit'
import { CHANGES, changeOf, summariseAccountability, type AccountabilitySummary } from '../data/accountability'
import { TIER_LABEL } from '../data/inventory'
import { SummaryCard, Trend, day, plural, when, ReviewAndMitigate } from './shared'
import { accountabilityActions } from '../data/guidance'
import { reachText } from './InventoryPanel'

const WEEK = 7 * 24 * 3_600_000
const weekOf = (t: number) => `Week of ${day(t)}`

/** Overview card: how much of the estate has someone answerable for it. */
export function AccountabilitySummary({ agents, audit }: { agents: readonly Agent[]; audit: Audit }) {
  const s = useMemo(() => summariseAccountability(agents, audit.lifecycle, audit.access), [agents, audit])
  return (
    <SummaryCard
      to="accountability"
      title="Accountability & ownership"
      value={`${full(s.owned)} of ${full(s.agents)}`}
      valueSuffix="agents have a named owner"
      line={
        <>
          <strong>{full(s.executiveUnowned)}</strong> agents that can act have no owner ·{' '}
          <strong>{full(s.changes)}</strong> changes by <strong>{full(s.people)}</strong> {s.people === 1 ? 'person' : 'people'}, last {AUDIT_DAYS} days
        </>
      }
    >
      <Trend
        x={s.weekly.map((w) => w.from)} values={s.weekly.map((w) => w.count)} color={series(1)} label="Agent changes"
        formatValue={full} formatX={weekOf} height={150}
      />
    </SummaryCard>
  )
}

const RANKS = [
  { key: 'people', label: 'Who changed agents' },
  { key: 'owners', label: 'Who owns agents' },
  { key: 'unowned', label: 'Agents that act, no owner' },
] as const
type Rank = (typeof RANKS)[number]['key']

const LOGS = [
  { key: 'agents', label: 'Agent changes' },
  { key: 'access', label: 'Access changes' },
] as const
type LogKey = (typeof LOGS)[number]['key']

function Ranking({ s }: { s: AccountabilitySummary }) {
  const [tab, setTab] = useState<Rank>('people')

  const people = s.actors.map((a) => ({
    key: a.name,
    label: a.name,
    value: a.total,
    detail: [
      { label: 'Role', value: a.role ?? '—' },
      ...CHANGES.filter((c) => a.counts[c] > 0).map((c) => ({ label: c, value: full(a.counts[c]) })),
      { label: 'Last active', value: when(a.last) },
    ],
  }))
  const owners = s.owners.map((o) => ({
    key: o.name,
    label: o.name,
    value: o.agents,
    detail: [{ label: 'Can act on systems', value: full(o.executive) }],
  }))
  const unowned = s.unowned.slice(0, 200).map((r) => ({
    key: r.agent.id,
    label: r.agent.name,
    value: r.agent.executions ?? 0,
    detail: [
      { label: 'Risk tier', value: TIER_LABEL[r.tier] },
      { label: 'Reaches', value: reachText(r) },
      { label: 'Data involved', value: r.agent.dataSources.join(', ') || 'None' },
    ],
  }))

  const rows = tab === 'people' ? people : tab === 'owners' ? owners : unowned
  return (
    <Card
      hideTitle
      title="Accountability ranking"
      controls={<Tabs tabs={RANKS} value={tab} onChange={setTab} ariaLabel="Ranking" />}
      footer={
        tab === 'people' ? `Named people behind agent changes in the last ${AUDIT_DAYS} days. Hover a row for what they did.`
          : tab === 'owners' ? "Owners assigned in Airia's asset registry."
          : 'Agents with a tool or MCP gateway and no owner, ranked by how often they run. Hover for the data they can reach.'
      }
    >
      {rows.length === 0
        ? <p className="pn-pending">{tab === 'owners' ? 'No agent has an owner assigned.' : 'Nothing to show.'}</p>
        : (
          <RankTable
            key={tab}
            rows={rows}
            labelHeading={tab === 'people' ? 'Person' : tab === 'owners' ? 'Owner' : 'Agent'}
            valueHeading={tab === 'people' ? 'Changes' : tab === 'owners' ? 'Agents' : 'Runs'}
            showChange={false}
            formatValue={full}
          />
        )}
    </Card>
  )
}

function AuditTrail({ s }: { s: AccountabilitySummary }) {
  const [tab, setTab] = useState<LogKey>('agents')
  const events = tab === 'agents' ? s.log : s.access.events
  const total = tab === 'agents' ? s.changes : s.access.total
  const truncated = tab === 'agents' ? s.changesTruncated : s.access.truncated
  const columns = [
    { key: 'when', label: 'When', align: 'left' as const },
    { key: 'who', label: 'Who', align: 'left' as const },
    { key: 'action', label: 'Action', align: 'left' as const },
    { key: 'what', label: 'What', align: 'left' as const },
  ]
  const rows = events.map((e) => ({
    when: when(e.at),
    who: e.role ? `${e.actor} · ${e.role}` : e.actor,
    action: `${tab === 'agents' ? changeOf(e) ?? e.operation : e.operation} ${e.resourceType}`,
    what: e.description || e.resource,
  }))
  return (
    <Card
      hideTitle
      title="Audit trail"
      controls={<Tabs tabs={LOGS} value={tab} onChange={setTab} ariaLabel="Audit trail" />}
      footer={
        <>
          {tab === 'agents' ? 'Who created, published, deployed or removed an agent' : 'Who granted or changed access'}, newest first.
          {truncated ? ` Showing the latest ${full(events.length)} of ${full(total)} recorded entries.` : ''}
        </>
      }
    >
      <TableView caption="Audit trail, newest first" columns={columns} rows={rows} maxHeight={420} />
    </Card>
  )
}

/**
 * Detail page — accountability and ownership.
 *
 * Two questions from two sources. The inventory says who OWNS an agent; the
 * audit log says who ACTED on one. The sharpest finding is where they part:
 * an agent that can act on company systems and has nobody answerable for it.
 */
export function AccountabilityPanel({ agents, audit }: { agents: readonly Agent[]; audit: Audit }) {
  const s = useMemo(() => summariseAccountability(agents, audit.lifecycle, audit.access), [agents, audit])
  const accessTotal = s.accessWeekly.reduce((n, w) => n + w.count, 0)
  const x = s.weekly.map((w) => w.from)

  return (
    <>
      <div className="strip">
        <StatTile label="Agents with an owner" value={`${full(s.owned)} of ${full(s.agents)}`} />
        <StatTile label="Can act, no owner" value={full(s.executiveUnowned)} />
        <StatTile label={`Changes to agents, ${AUDIT_DAYS} days`} value={full(s.changes)} trend={s.weekly.map((w) => w.count)} />
        <StatTile label="People making changes" value={full(s.people)} />
        <StatTile label="Attributed to a person" value={s.changes ? percent(s.attributed, 0) : '—'} />
      </div>

      <p className="page__scope">
        <span>
          <strong>{plural(s.executiveUnowned, 'agent')}</strong> that can act on company systems {s.executiveUnowned === 1 ? 'has' : 'have'} no named owner.
          In the last {AUDIT_DAYS} days {plural(s.people, 'person', 'people')} made {plural(s.changes, 'change')} to agents.
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="Agent changes"
            value={full(s.changes)}
            valueSuffix={`in ${AUDIT_DAYS} days`}
            footer={
              <>
                {CHANGES.filter((c) => s.byChange[c] > 0).map((c) => `${c} ${full(s.byChange[c])}`).join(' · ') || 'No changes recorded.'}
                {' '}· weekly steps · source <code>GET /v1/AuditLog/entries</code>
              </>
            }
          >
            <Trend x={x} values={s.weekly.map((w) => w.count)} color={series(1)} label="Agent changes"
              formatValue={full} formatX={(t) => `${weekOf(t)} – ${day(t + WEEK - 1)}`} />
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="Access changes"
            value={full(accessTotal)}
            valueSuffix={`in ${AUDIT_DAYS} days`}
            footer="API keys, credentials, access control, groups and role assignments. Weekly steps."
          >
            <Trend x={x} values={s.accessWeekly.map((w) => w.count)} color={series(7)} label="Access changes"
              formatValue={full} formatX={(t) => `${weekOf(t)} – ${day(t + WEEK - 1)}`} />
          </Card>
        </div>
        <div className="grid__full"><Ranking s={s} /></div>
        <div className="grid__full"><AuditTrail s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={accountabilityActions(s)} /></div>
      </div>
    </>
  )
}
