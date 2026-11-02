import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { series } from '../theme/palette'
import { full } from '../lib/format'
import type { Incidents } from '../lib/airia/incidents'
import { INCIDENT_DAYS } from '../lib/airia/incidents'
import { summariseIncidents, type IncidentSummary } from '../data/incidents'
import { SummaryCard, Trend, day, plural, when, ReviewAndMitigate } from './shared'
import { incidentActions } from '../data/guidance'

const WEEK = 7 * 24 * 3_600_000
const weekSpan = (t: number) => `${day(t)} – ${day(t + WEEK - 1)}`
const unavailable = <p className="pn-pending">Not available to this key.</p>

/** Overview card: how often something went wrong, and how ready the response is. */
export function IncidentsSummary({ incidents }: { incidents: Incidents }) {
  const s = useMemo(() => summariseIncidents(incidents), [incidents])
  const i = incidents
  return (
    <SummaryCard
      to="incidents"
      title="Incident response & near-misses"
      value={full(s.events)}
      valueSuffix={`security events, last ${INCIDENT_DAYS} days`}
      line={
        <>
          <strong>{full(s.nearMissesStopped ?? 0)}</strong> agent actions blocked ·{' '}
          <strong>{full(i.runs?.total ?? 0)}</strong> response-playbook {i.runs?.total === 1 ? 'run' : 'runs'} ever
        </>
      }
    >
      {i.events
        ? <Trend x={s.weekly.map((w) => w.from)} values={s.weekly.map((w) => w.count)} color={series(1)} label="Security events"
            formatValue={full} formatX={weekSpan} height={150} />
        : unavailable}
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'ready', label: 'Response readiness' },
  { key: 'log', label: 'Incident log' },
  { key: 'fix', label: 'Remediation actions' },
] as const
type View = (typeof VIEWS)[number]['key']

function Detail({ s }: { s: IncidentSummary }) {
  const [view, setView] = useState<View>('ready')
  const i = s.raw

  const ready = {
    columns: [
      { key: 'control', label: 'What a board is asked for', align: 'left' as const },
      { key: 'posture', label: 'Posture', align: 'left' as const },
      { key: 'detail', label: 'Where it stands', align: 'left' as const },
      { key: 'why', label: 'Why it matters', align: 'left' as const },
    ],
    rows: s.readiness.map((c) => ({ control: c.control, posture: c.posture, detail: c.detail, why: c.why })),
  }
  const log = {
    columns: [
      { key: 'when', label: 'When', align: 'left' as const },
      { key: 'what', label: 'Event', align: 'left' as const },
      { key: 'sev', label: 'Severity', align: 'left' as const },
      { key: 'who', label: 'By', align: 'left' as const },
      { key: 'out', label: 'Outcome', align: 'left' as const },
      { key: 'detail', label: 'Detail', align: 'left' as const },
    ],
    rows: s.log.map((r) => ({
      when: when(r.event.at), what: r.label, sev: r.event.severity,
      who: r.event.actorType === 'User' ? 'A person' : r.event.actorType, out: r.event.success ? 'Succeeded' : 'Failed', detail: r.what,
    })),
  }
  const fix = {
    columns: [
      { key: 'when', label: 'When', align: 'left' as const },
      { key: 'action', label: 'Action', align: 'left' as const },
      { key: 'client', label: 'Tool', align: 'left' as const },
      { key: 'applied', label: 'Applied', align: 'left' as const },
    ],
    rows: (i.remediations?.recent ?? []).map((a) => ({
      when: when(a.at), action: a.action.replace(/_/g, ' '), client: a.client || '—', applied: a.applied ? 'Yes' : 'No',
    })),
  }

  return (
    <Card
      hideTitle
      title="Incident response detail"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Incident detail" />}
      footer={
        view === 'ready' ? 'Each thing a regulator or director would ask for after an incident, and whether the platform has it, lacks it, or cannot tell.'
          : view === 'log' ? `Security events from the audit log, newest first. Email addresses are partly masked.${s.truncated ? ` Showing the latest ${full(s.log.length)} of ${full(s.events)}.` : ''}`
          : 'Corrective changes the endpoint agent made on devices, newest first.'
      }
    >
      {view === 'ready' ? (
        <TableView caption="Incident response readiness" columns={ready.columns} rows={ready.rows} maxHeight={460} />
      ) : view === 'log' ? (
        i.events ? <TableView caption="Security event log" columns={log.columns} rows={log.rows} maxHeight={460} /> : unavailable
      ) : fix.rows.length ? (
        <TableView caption="Remediation actions" columns={fix.columns} rows={fix.rows} maxHeight={460} />
      ) : <p className="pn-pending">No remediation actions recorded.</p>}
    </Card>
  )
}

/**
 * Detail page — incident response and near-misses.
 *
 * Boards are asked for an incident log, time to remediate and lessons learned.
 * The platform holds the first in part, the second not at all and the third
 * not at all — and the page says so, rather than showing a tidy number that
 * is really a guess.
 */
export function IncidentsPanel({ incidents }: { incidents: Incidents }) {
  const s = useMemo(() => summariseIncidents(incidents), [incidents])
  const i = incidents
  const open = i.exposures ? Math.max(0, i.exposures.total - i.exposures.remediated) : null
  const byType = s.byType.map((t) => ({
    key: t.type, label: t.label, value: t.count,
    detail: [{ label: 'Share of security events', value: s.events ? `${Math.round((t.count / s.events) * 100)}%` : '—' }],
  }))

  return (
    <>
      <div className="strip">
        <StatTile label={`Security events, ${INCIDENT_DAYS} days`} value={i.events ? full(s.events) : '—'} trend={s.weekly.map((w) => w.count)} />
        <StatTile label="Critical severity" value={i.events ? full(s.critical) : '—'} />
        <StatTile label="Near-misses stopped" value={i.tools ? `${full(i.tools.blocked)} of ${full(i.tools.total)}` : '—'} />
        <StatTile label="Response playbooks" value={i.runbooks ? full(i.runbooks.total) : '—'} />
        <StatTile label="Playbook runs" value={i.runs ? full(i.runs.total) : '—'} />
        <StatTile label="Exposures still open" value={open == null ? '—' : full(open)} />
      </div>

      <p className="page__scope">
        <span>
          {i.runbooks ? <><strong>{plural(i.runbooks.total, 'response playbook')}</strong> {i.runbooks.total === 1 ? 'is' : 'are'} defined</> : null}
          {i.runs ? <> and {i.runs.total === 0 ? <strong>none has ever run</strong> : <>{plural(i.runs.total, 'run')} on record</>}. </> : '. '}
          {i.tools ? <>Of {full(i.tools.total)} agent actions, {full(i.tools.blocked)} {i.tools.blocked === 1 ? 'was' : 'were'} stopped; the rest were only logged. </> : null}
          Time to remediate and lessons learned cannot be reported from Airia: it records when an event happens, not when it is resolved.
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="Security events"
            value={i.events ? full(s.events) : '—'}
            valueSuffix={`last ${INCIDENT_DAYS} days`}
            footer={<>Weekly steps. Failed sign-ins, policy and data-loss violations, anomalies, terminated sessions and impersonation, from <code>GET /v1/AuditLog/entries</code></>}
          >
            {i.events
              ? <Trend x={s.weekly.map((w) => w.from)} values={s.weekly.map((w) => w.count)} color={series(1)} label="Security events"
                  formatValue={full} formatX={weekSpan} />
              : unavailable}
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="What happened"
            value={s.byType.length ? full(s.byType.length) : '—'}
            valueSuffix={s.byType.length === 1 ? 'kind of event' : 'kinds of event'}
            footer="Hover a row for its share of all security events."
          >
            {byType.length
              ? <RankTable rows={byType} labelHeading="Event" valueHeading="Events" showChange={false} formatValue={full} pageSize={6} />
              : <p className="pn-pending">No security events in this period.</p>}
          </Card>
        </div>
        <div className="grid__full"><Detail s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={incidentActions(s)} /></div>
      </div>
    </>
  )
}
