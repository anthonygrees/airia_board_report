import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { series } from '../theme/palette'
import { full, percent } from '../lib/format'
import type { Agent } from '../lib/airia/agents'
import type { Discovery } from '../lib/airia/discovery'
import { summariseShadow, type ShadowSummary } from '../data/shadow'
import { SummaryCard, Trend, dayYear, plural, ReviewAndMitigate } from './shared'
import { shadowActions } from '../data/guidance'

const unavailable = <p className="pn-pending">Not available to this key.</p>
const nice = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2')
const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** Overview card: how much AI is in use that nobody approved, and how little of the visible traffic is controlled. */
export function ShadowSummary({ discovery, agents }: { discovery: Discovery; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseShadow(discovery, agents), [discovery, agents])
  const u = discovery.usage
  return (
    <SummaryCard
      to="shadow"
      title="Shadow AI & ungoverned adoption"
      value={full(s.apps)}
      valueSuffix="AI apps found on company devices"
      line={
        <>
          <strong>{full(s.unmanagedApps)}</strong> {s.unmanagedApps === 1 ? 'is' : 'are'} unmanaged
          {s.passive != null ? <> · <strong>{percent(s.passive, 0)}</strong> of AI traffic is only watched, never blocked</> : null}
        </>
      }
    >
      {u && u.length > 1
        ? <Trend x={u.map((p) => p.at)} values={u.map((p) => p.events)} color={series(1)} label="AI tool events"
            formatValue={full} formatX={dayLabel} height={150} />
        : unavailable}
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'apps', label: 'Discovered apps' },
  { key: 'findings', label: 'Findings' },
  { key: 'agents', label: 'Agents on other platforms' },
  { key: 'coverage', label: 'Detection coverage' },
] as const
type View = (typeof VIEWS)[number]['key']

function Detail({ s }: { s: ShadowSummary }) {
  const [view, setView] = useState<View>('apps')
  const d = s.d

  const apps = {
    columns: [
      { key: 'name', label: 'App', align: 'left' as const },
      { key: 'users', label: 'Users', align: 'right' as const },
      { key: 'managed', label: 'Managed', align: 'left' as const },
      { key: 'risk', label: 'Risk', align: 'left' as const },
      { key: 'first', label: 'First seen', align: 'left' as const },
      { key: 'last', label: 'Last seen', align: 'left' as const },
    ],
    rows: [...(d.apps ?? [])].sort((a, b) => b.users - a.users || a.name.localeCompare(b.name)).map((a) => ({
      name: a.name, users: full(a.users), managed: a.managed ? 'Yes' : 'No', risk: a.risk,
      first: a.firstSeen ? dayYear(a.firstSeen) : '—', last: a.lastSeen ? dayYear(a.lastSeen) : '—',
    })),
  }
  const findings = {
    columns: [
      { key: 'f', label: 'Finding', align: 'left' as const },
      { key: 's', label: 'Severity', align: 'left' as const },
      { key: 'n', label: 'Found', align: 'right' as const },
      { key: 'w', label: 'New this week', align: 'right' as const },
      { key: 'a', label: 'Mostly', align: 'left' as const },
    ],
    rows: (d.findings ?? []).map((f) => ({
      f: nice(f.type), s: f.severity, n: `${full(f.headline)} ${f.unit.toLowerCase()}`, w: full(f.newThisWeek),
      a: f.topApps.slice(0, 3).map((x) => x.name).join(', ') || '—',
    })),
  }
  const agents = {
    columns: [
      { key: 'p', label: 'Platform', align: 'left' as const },
      { key: 'd', label: 'Agents found', align: 'right' as const },
      { key: 's', label: 'Can be secured', align: 'right' as const },
      { key: 'c', label: 'Secured', align: 'right' as const },
    ],
    rows: (d.funnel?.providers ?? []).map((p) => ({ p: nice(p.provider), d: full(p.discovered), s: full(p.securable), c: full(p.secured) })),
  }
  const c = d.coverage
  const coverage = {
    columns: [
      { key: 'surface', label: 'How AI use is detected', align: 'left' as const },
      { key: 'seen', label: 'Where it stands', align: 'left' as const },
      { key: 'why', label: 'Why it matters', align: 'left' as const },
    ],
    rows: c ? [
      { surface: 'Platform connections (other clouds and tools)', seen: `${full(c.healthy)} of ${full(c.connections)} healthy, ${full(c.stale)} stale or failing`, why: 'A connection that has stopped reporting is a blind spot that looks like a quiet one.' },
      { surface: 'Endpoint agent (laptops and desktops)', seen: `${full(c.endpointDevices)} devices observed`, why: 'Sees apps, MCP servers and keys on the device itself.' },
      { surface: 'Browser extension', seen: `${full(c.browserCovered)} of ${full(c.browserFleet)} devices covered`, why: 'Sees AI websites people use, and is the only way to redirect them.' },
    ] : [],
  }

  return (
    <Card
      hideTitle
      title="Shadow AI detail"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Shadow AI detail" />}
      footer={
        view === 'apps' ? 'AI tools seen on company devices, by distinct users. "Managed" means the organisation administers the app.'
          : view === 'findings' ? "Airia's ranked discovery findings, most important first."
          : view === 'agents' ? 'Agents built on other platforms and found by connectors, and how many Airia can bring under its controls.'
          : 'Discovery is only as good as the sources feeding it. These are the four, and how much of the estate each can see.'
      }
    >
      {view === 'apps' ? (apps.rows.length ? <TableView caption="Discovered AI apps" columns={apps.columns} rows={apps.rows} maxHeight={440} /> : unavailable)
        : view === 'findings' ? (findings.rows.length ? <TableView caption="Discovery findings" columns={findings.columns} rows={findings.rows} maxHeight={440} /> : unavailable)
        : view === 'agents' ? (agents.rows.length ? <TableView caption="Agents on other platforms" columns={agents.columns} rows={agents.rows} maxHeight={440} /> : unavailable)
        : (coverage.rows.length ? <TableView caption="Detection coverage" columns={coverage.columns} rows={coverage.rows} maxHeight={440} /> : unavailable)}
    </Card>
  )
}

/**
 * Detail page — shadow AI and ungoverned adoption.
 *
 * Risk builds quietly in trusted systems. The page separates the two ways it
 * gets there: AI that arrives from outside (apps, other platforms), measured
 * by what is found and how little of it is controlled, and AI built inside
 * Airia that never passed through governance.
 */
export function ShadowPanel({ discovery, agents }: { discovery: Discovery; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseShadow(discovery, agents), [discovery, agents])
  const d = discovery
  const u = d.usage

  const appRows = (d.apps ?? []).map((a) => ({
    key: a.name, label: a.name, value: a.users,
    detail: [
      { label: 'Managed', value: a.managed ? 'Yes' : 'No' },
      { label: 'Risk', value: a.risk },
      { label: 'Last seen', value: a.lastSeen ? dayYear(a.lastSeen) : '—' },
    ],
  }))
  const total = u ? u.reduce((n, p) => n + p.events, 0) : 0

  return (
    <>
      <div className="strip">
        <StatTile label="AI apps found" value={d.kpis || d.apps ? full(s.apps) : '—'}
          delta={s.newApps > 0 ? { direction: 'up', text: full(s.newApps), vs: 'new this week' } : undefined} />
        <StatTile label="Unmanaged apps" value={d.apps ? full(s.unmanagedApps) : '—'} />
        <StatTile label="AI browser events" value={d.unmet ? full(s.events) : '—'} />
        <StatTile label="Third-party agents secured" value={d.funnel ? `${full(s.secured)} of ${full(s.securable)}` : '—'} />
        <StatTile label="Devices under enforced policy" value={d.devices ? `${full(s.devicesEnforced)} of ${full(s.devices)}` : '—'} />
        <StatTile label="Airia agents outside governance" value={s.internal ? `${full(s.ungoverned)} of ${full(s.internal)}` : '—'} />
      </div>

      <p className="page__scope">
        <span>
          {d.unmet ? <>AI use is visible but not governed: of <strong>{full(s.events)}</strong> browser events to AI tools,{' '}
            <strong>{s.passive != null ? percent(s.passive, 0) : '—'}</strong> were only watched ({full(d.unmet.blocked)} blocked, {full(d.unmet.warned)} warned). </> : null}
          {d.apps ? <><strong>{plural(s.unmanagedApps, 'AI app')}</strong> {s.unmanagedApps === 1 ? 'is' : 'are'} in use and unmanaged. </> : null}
          {d.funnel ? <>{full(s.secured)} of {full(s.discovered)} agents found on other platforms {s.secured === 1 ? 'is' : 'are'} secured. </> : null}
          {s.internal ? <>{full(s.ungoverned)} of {full(s.internal)} Airia-built agents sit outside any governed use case. </> : null}
          Airia records no department for an agent, so a departmental view is not possible.
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="AI tool use"
            value={u && u.length ? full(total) : '—'}
            valueSuffix="browser events to AI tools"
            footer={<>Daily steps; days with no events are not shown. Source <code>GET /v1/ShadowAiEvents/analytics/usage-over-time</code></>}
          >
            {u && u.length > 1
              ? <Trend x={u.map((p) => p.at)} values={u.map((p) => p.events)} color={series(1)} label="AI tool events"
                  formatValue={full} formatX={dayLabel} />
              : unavailable}
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="AI apps by users"
            value={d.apps ? full(s.apps) : '—'}
            valueSuffix="apps found"
            footer="Hover a row for whether the app is managed, its risk and when it was last seen."
          >
            {appRows.length
              ? <RankTable rows={appRows} labelHeading="App" valueHeading="Users" showChange={false} formatValue={full} pageSize={6} />
              : <p className="pn-pending">No AI apps found.</p>}
          </Card>
        </div>
        <div className="grid__full"><Detail s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={shadowActions(s)} /></div>
      </div>
    </>
  )
}
