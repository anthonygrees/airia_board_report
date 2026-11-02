import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { currency, full, percent } from '../lib/format'
import type { Agent } from '../lib/airia/agents'
import type { Discovery } from '../lib/airia/discovery'
import type { Finance } from '../lib/airia/billing'
import { QUARTER_DAYS } from '../lib/airia/billing'
import { summariseVendors, type VendorSummary } from '../data/vendors'
import { SummaryCard, plural, ReviewAndMitigate } from './shared'
import { vendorActions } from '../data/guidance'

const money = (n: number) => currency(n, n < 100 ? 2 : 0)

const HOSTS: Record<string, string> = { AzureFoundry: 'Azure AI Foundry', AwsBedrock: 'AWS Bedrock', CopilotStudio: 'Copilot Studio', N8n: 'n8n' }
const nice = (s: string) => HOSTS[s] ?? s.replace(/([a-z])([A-Z])/g, '$1 $2')

const pastBucket = (d: Discovery) => d.deprecation?.burndown.find((b) => b.bucket === 'Already past')?.count ?? 0

/** Overview card: how concentrated the AI supply chain is, and how much of it is being retired under the agents. */
export function VendorsSummary({ discovery, finance, agents }: { discovery: Discovery; finance: Finance | null; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseVendors(discovery, finance, agents), [discovery, finance, agents])
  const rows = s.spend.map((v) => ({ key: v.vendor, label: v.vendor, value: v.cost }))
  const dep = discovery.deprecation
  return (
    <SummaryCard
      to="vendors"
      title="Third-party & vendor risk"
      value={dep ? full(pastBucket(discovery)) : '—'}
      valueSuffix="models already past deprecation"
      line={
        <>
          {dep ? <><strong>{full(dep.agentsAtRisk)}</strong> agents depend on a retiring model</> : null}
          {dep && s.topVendor ? ' · ' : null}
          {s.topVendor ? <><strong>{percent(s.topVendor.share, 0)}</strong> of spend is with {s.topVendor.vendor}</> : null}
        </>
      }
    >
      {rows.length
        ? <RankTable rows={rows} labelHeading="Model vendor" valueHeading="Spend" showChange={false} formatValue={money} pageSize={4} />
        : <p className="pn-pending">Vendor spend not available.</p>}
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'retiring', label: 'Retiring models' },
  { key: 'models', label: 'Models agents rely on' },
  { key: 'tools', label: 'Tools agents rely on' },
  { key: 'platforms', label: 'Third-party platforms' },
] as const
type View = (typeof VIEWS)[number]['key']

function Detail({ s }: { s: VendorSummary }) {
  const [view, setView] = useState<View>('retiring')
  const d = s.d
  const dep = d.deprecation

  const retiring = {
    columns: [
      { key: 'model', label: 'Model', align: 'left' as const },
      { key: 'status', label: 'Status', align: 'left' as const },
      { key: 'agents', label: 'Agents relying on it', align: 'right' as const },
      { key: 'runs', label: 'Recent runs', align: 'right' as const },
      { key: 'spend', label: 'Spend', align: 'right' as const },
    ],
    // Most agents first: the order a remediation would be planned in.
    rows: [...(dep?.list ?? [])].sort((a, b) => b.agents - a.agents || (a.days ?? 0) - (b.days ?? 0)).map((m) => ({
      model: m.name,
      status: m.days == null ? 'Unknown' : m.days < 0 ? `Past by ${plural(-m.days, 'day')}` : `In ${plural(m.days, 'day')}`,
      agents: full(m.agents), runs: full(m.executions), spend: money(m.spend),
    })),
  }
  const platforms = {
    columns: [
      { key: 'p', label: 'Platform', align: 'left' as const },
      { key: 'd', label: 'Agents found', align: 'right' as const },
      { key: 's', label: 'Can be secured', align: 'right' as const },
      { key: 'c', label: 'Secured', align: 'right' as const },
    ],
    rows: (d.funnel?.providers ?? []).map((p) => ({ p: nice(p.provider), d: full(p.discovered), s: full(p.securable), c: full(p.secured) })),
  }
  const toRank = (list: { name: string; agents: number }[]) => list.map((x) => ({
    key: x.name, label: x.name, value: x.agents,
    detail: [{ label: 'Share of Airia-built agents', value: percent(x.agents / Math.max(1, s.agentCount), 0) }],
  }))

  return (
    <Card
      hideTitle
      title="Supply chain detail"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Supply chain detail" />}
      footer={
        view === 'retiring' ? `Models the estate depends on that the catalog marks as deprecated or deprecating${dep && dep.list.length < dep.models ? `. Showing ${full(dep.list.length)} of ${full(dep.models)}` : ''}.`
          : view === 'models' ? 'Models named by Airia-built agents, by how many agents use each. One retired model reaches every agent in its row.'
          : view === 'tools' ? 'Third-party tools and integrations attached to Airia-built agents, by how many agents rely on each.'
          : 'Agents found on other platforms, and how many of them Airia can bring under its controls.'
      }
    >
      {view === 'retiring' ? (
        retiring.rows.length ? <TableView caption="Retiring models" columns={retiring.columns} rows={retiring.rows} maxHeight={440} /> : <p className="pn-pending">Not available to this key.</p>
      ) : view === 'platforms' ? (
        platforms.rows.length ? <TableView caption="Third-party platforms" columns={platforms.columns} rows={platforms.rows} maxHeight={440} /> : <p className="pn-pending">Not available to this key.</p>
      ) : (view === 'models' ? s.models : s.tools).length === 0 ? (
        <p className="pn-pending">No agent names a {view === 'models' ? 'model' : 'tool'}.</p>
      ) : (
        <RankTable key={view} rows={toRank(view === 'models' ? s.models : s.tools)} labelHeading={view === 'models' ? 'Model' : 'Tool'}
          valueHeading="Agents" showChange={false} formatValue={full} />
      )}
    </Card>
  )
}

/**
 * Detail page — third-party and vendor risk.
 *
 * Airia holds no vendor security ratings, so this is about the supply chain
 * the platform can actually see: concentration of spend, models being
 * retired beneath live agents, and how much of the third-party estate is
 * connected and under control.
 */
export function VendorsPanel({ discovery, finance, agents }: { discovery: Discovery; finance: Finance | null; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseVendors(discovery, finance, agents), [discovery, finance, agents])
  const d = discovery
  const dep = d.deprecation
  const top = s.topVendor
  const unattributed = s.spend.find((v) => !v.attributed)

  const spend = s.spend.map((v) => ({
    key: v.vendor, label: v.vendor, value: v.cost,
    detail: [
      { label: 'Share of spend', value: percent(v.share, 1) },
      { label: v.attributed ? 'Models' : 'Why', value: v.attributed ? v.models.join(', ') || '—' : 'Gateway traffic is billed without naming a model' },
    ],
  }))
  const hosting = (d.hosting ?? []).map((h) => ({
    key: `${h.host}|${h.vendor}`, label: `${nice(h.host)} → ${h.vendor}`, value: h.count,
    detail: [{ label: 'Hosted by', value: nice(h.host) }, { label: 'Model from', value: h.vendor }],
  }))

  return (
    <>
      <div className="strip">
        <StatTile label="Model vendors in use" value={s.vendors ? full(s.vendors) : '—'} />
        <StatTile label="Largest vendor's share of spend" value={top ? `${percent(top.share, 0)} ${top.vendor}` : '—'} />
        <StatTile label="Models past deprecation" value={dep ? full(pastBucket(d)) : '—'} />
        <StatTile label="Agents on a retiring model" value={dep ? full(dep.agentsAtRisk) : '—'} />
        <StatTile label="Platform connections healthy" value={d.coverage ? `${full(d.coverage.healthy)} of ${full(d.coverage.connections)}` : '—'} />
        <StatTile label="Third-party agents secured" value={d.funnel ? `${full(d.funnel.secured)} of ${full(d.funnel.securable)}` : '—'} />
      </div>

      <p className="page__scope">
        <span>
          {top ? <><strong>{percent(top.share, 0)}</strong> of the last {QUARTER_DAYS} days' AI spend is with <strong>{top.vendor}</strong>{unattributed ? <>, and <strong>{percent(unattributed.share, 0)}</strong> cannot be tied to any vendor because it is gateway traffic</> : null}. </> : null}
          {dep ? <><strong>{full(dep.models)}</strong> models the estate relies on are deprecated or deprecating, <strong>{full(pastBucket(d))}</strong> already past their date, reaching <strong>{full(dep.agentsAtRisk)}</strong> agents. </> : null}
          {d.coverage ? <>{full(d.coverage.healthy)} of {full(d.coverage.connections)} third-party platform connections are healthy. </> : null}
          Airia holds no vendor security ratings, so rating trends and fourth-party scoring need an outside source.
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="Spend by model vendor"
            value={top ? top.vendor : '—'}
            valueSuffix={top ? `${percent(top.share, 0)} of the last ${QUARTER_DAYS} days` : undefined}
            footer="Billed cost of each model, grouped by the vendor that makes it. Hover a row for the models behind it."
          >
            {spend.length
              ? <RankTable rows={spend} labelHeading="Model vendor" valueHeading="Spend" showChange={false} formatValue={money} pageSize={6} />
              : <p className="pn-pending">Spend not available.</p>}
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="Fourth-party hosting"
            value={hosting.length ? full(hosting.length) : '—'}
            valueSuffix={hosting.length === 1 ? 'host and vendor pairing' : 'host and vendor pairings'}
            footer="Discovered models, by who hosts them and whose model they are. A model from one vendor served by another's cloud depends on both."
          >
            {hosting.length
              ? <RankTable rows={hosting} labelHeading="Host → model vendor" valueHeading="Models" showChange={false} formatValue={full} pageSize={6} />
              : <p className="pn-pending">Not available to this key.</p>}
          </Card>
        </div>
        <div className="grid__full"><Detail s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={vendorActions(s)} /></div>
      </div>
    </>
  )
}
