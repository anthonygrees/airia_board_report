import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { series } from '../theme/palette'
import { full, percent } from '../lib/format'
import type { Security } from '../lib/airia/security'
import { VIOLATION_DAYS } from '../lib/airia/security'
import { VIOLATION_LABEL, summariseSecurity, type SecuritySummary } from '../data/security'
import { SummaryCard, Trend, day, plural, ReviewAndMitigate } from './shared'
import { securityActions } from '../data/guidance'

const WEEK = 7 * 24 * 3_600_000
const weekSpan = (t: number) => `${day(t)} – ${day(t + WEEK - 1)}`

const unavailable = <p className="pn-pending">Not available to this key.</p>

/** Overview card: how much sensitive data the guardrails caught, and how much of agent activity is actually controlled. */
export function SecuritySummary({ security }: { security: Security }) {
  const s = useMemo(() => summariseSecurity(security), [security])
  const t = s.toolCalls
  return (
    <SummaryCard
      to="security"
      title="Cybersecurity & data governance"
      value={s.violations == null ? '—' : full(s.violations)}
      valueSuffix={`policy violations, last ${VIOLATION_DAYS} days`}
      line={
        <>
          {s.sensitive != null ? <><strong>{full(s.sensitive)}</strong> involved personal, payment or secret data</> : null}
          {s.sensitive != null && t ? ' · ' : null}
          {t ? <>only <strong>{full(t.blocked)}</strong> of <strong>{full(t.total)}</strong> agent actions were blocked</> : null}
        </>
      }
    >
      {s.weeks.length
        ? <Trend x={s.weeks.map((w) => w.from)} values={s.weeks.map((w) => w.count)} color={series(1)} label="Violations"
            formatValue={full} formatX={weekSpan} height={150} />
        : unavailable}
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'controls', label: 'Control posture' },
  { key: 'mcp', label: 'MCP servers' },
  { key: 'apps', label: 'AI apps in use' },
  { key: 'keys', label: 'Exposed keys' },
] as const
type View = (typeof VIEWS)[number]['key']

function Posture({ s }: { s: SecuritySummary }) {
  const [view, setView] = useState<View>('controls')
  const raw = s.raw

  const controls = {
    columns: [
      { key: 'control', label: 'Control', align: 'left' as const },
      { key: 'posture', label: 'Posture', align: 'left' as const },
      { key: 'detail', label: 'Where it stands', align: 'left' as const },
      { key: 'why', label: 'Why it matters', align: 'left' as const },
    ],
    rows: s.controls.map((c) => ({ control: c.control, posture: c.posture, detail: c.detail, why: c.why })),
  }

  const mcp = (raw.mcp?.servers ?? []).map((m) => ({
    key: m.name,
    label: `${m.name}${m.sanctioned ? '' : ' (unsanctioned)'}`,
    value: m.devices,
    detail: [{ label: 'Sanctioned', value: m.sanctioned ? 'Yes' : 'No' }, { label: 'Devices running it', value: full(m.devices) }],
  }))
  const apps = (raw.apps ?? []).map((a) => ({
    key: a.app, label: a.app, value: a.users,
    detail: [{ label: 'Events seen', value: full(a.events) }],
  }))
  const keys = (raw.credentials?.byProvider ?? []).map((c) => ({
    key: c.provider, label: c.provider, value: c.count,
    detail: [{ label: 'Where', value: 'Plain-text key in a shell file on a device' }],
  }))

  return (
    <Card
      hideTitle
      title="Security posture"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Security detail" />}
      footer={
        view === 'controls' ? 'Each control, where it stands today, and why a director should care. Posture is judged only from what the platform can see.'
          : view === 'mcp' ? 'MCP servers found on devices by the endpoint agent, by how many devices run them. Each is a path from an AI tool into company systems.'
          : view === 'apps' ? 'AI tools reached from company browsers, by distinct users (all time).'
          : 'AI provider keys found in plain text on devices. Only the provider is shown — the key, path and owner stay out of this page.'
      }
    >
      {view === 'controls' ? (
        <TableView caption="Security control posture" columns={controls.columns} rows={controls.rows} maxHeight={460} />
      ) : (view === 'mcp' ? mcp : view === 'apps' ? apps : keys).length === 0 ? (
        <p className="pn-pending">{view === 'keys' ? 'No exposed keys found.' : 'Nothing found.'}</p>
      ) : (
        <RankTable
          key={view}
          rows={view === 'mcp' ? mcp : view === 'apps' ? apps : keys}
          labelHeading={view === 'mcp' ? 'MCP server' : view === 'apps' ? 'App' : 'Provider'}
          valueHeading={view === 'mcp' ? 'Devices' : view === 'apps' ? 'Users' : 'Keys'}
          showChange={false}
          formatValue={full}
        />
      )}
    </Card>
  )
}

/**
 * Detail page — cybersecurity and data governance.
 *
 * The board's first question is "what is exposed", and the honest answer has
 * three parts: what the guardrails caught, how much agent activity is
 * controlled rather than merely recorded, and what the platform cannot see.
 */
export function SecurityPanel({ security }: { security: Security }) {
  const s = useMemo(() => summariseSecurity(security), [security])
  const t = s.toolCalls
  const a = s.agents
  const v = security.violations
  const gaps = s.controls.filter((c) => c.posture === 'Gap').map((c) => c.control)
  const partial = s.controls.filter((c) => c.posture === 'Partial').map((c) => c.control)

  const caught = (v?.byType ?? []).map((x) => ({
    key: x.type, label: VIOLATION_LABEL[x.type], value: x.count,
    detail: [{ label: `Share of ${VIOLATION_DAYS}-day violations`, value: v && v.last90 ? percent(x.count / v.last90, 1) : '—' }],
  }))

  return (
    <>
      <div className="strip">
        <StatTile label={`Policy violations, ${VIOLATION_DAYS} days`} value={s.violations == null ? '—' : full(s.violations)}
          delta={s.change == null ? undefined : { direction: s.change > 0.005 ? 'up' : s.change < -0.005 ? 'down' : 'none', text: `${Math.abs(s.change * 100).toFixed(0)}%`, vs: `vs prior ${VIOLATION_DAYS} days` }} />
        <StatTile label="Sensitive data caught" value={s.sensitive == null ? '—' : full(s.sensitive)} />
        <StatTile label="Agent actions blocked" value={t ? `${full(t.blocked)} of ${full(t.total)}` : '—'} />
        <StatTile label="Discovered agents secured" value={a ? `${full(a.secured)} of ${full(a.securable)}` : '—'} />
        <StatTile label="AI keys exposed on devices" value={s.credentials ? full(s.credentials.total) : '—'} />
        <StatTile label="Red-team campaigns run" value={security.redTeamCampaigns == null ? '—' : full(security.redTeamCampaigns)} />
      </div>

      <p className="page__scope">
        <span>
          {gaps.length ? <><strong>{plural(gaps.length, 'control')} {gaps.length === 1 ? 'shows' : 'show'} a gap:</strong> {gaps.join(', ')}. </> : <>No control shows a gap. </>}
          {partial.length ? <>Partly in place: {partial.join(', ')}. </> : null}
          {a && a.highRisk > 0 ? <>{plural(a.highRisk, 'discovered agent')} {a.highRisk === 1 ? 'is' : 'are'} rated high risk.</> : null}
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="Policy violations"
            value={s.violations == null ? '—' : full(s.violations)}
            valueSuffix={`last ${VIOLATION_DAYS} days`}
            footer={<>Weekly steps. One item per detection by a guardrail — not one per conversation. {v ? `${full(v.allTime)} since the tenant began. ` : ''}Source <code>GET /v1/Feed/policy-violations</code></>}
          >
            {s.weeks.length
              ? <Trend x={s.weeks.map((w) => w.from)} values={s.weeks.map((w) => w.count)} color={series(1)} label="Violations"
                  formatValue={full} formatX={weekSpan} />
              : unavailable}
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="What was caught"
            value={s.sensitive == null ? '—' : full(s.sensitive)}
            valueSuffix="personal, payment, health or secret data"
            footer={s.injection != null ? `${plural(s.injection, 'prompt-injection or jailbreak attempt')} in the same period. Hover a row for its share.` : 'Hover a row for its share.'}
          >
            {caught.length
              ? <RankTable rows={caught} labelHeading="Type" valueHeading="Violations" showChange={false} formatValue={full} pageSize={6} />
              : <p className="pn-pending">No violations in this period.</p>}
          </Card>
        </div>
        <div className="grid__full"><Posture s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={securityActions(s)} /></div>
      </div>
    </>
  )
}
