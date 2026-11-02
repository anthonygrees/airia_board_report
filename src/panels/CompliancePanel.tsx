import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, TableView, Tabs } from '../components'
import { full } from '../lib/format'
import type { Compliance } from '../lib/airia/compliance'
import { euTier, summariseCompliance, type ComplianceSummary, type DeadlineRow } from '../data/compliance'
import { SummaryCard, dayYear, plural, ReviewAndMitigate } from './shared'
import { complianceActions } from '../data/guidance'

/** "Passed 89 days ago", "In 14 days", or "Ongoing" for an undated obligation. */
function when(d: DeadlineRow): string {
  if (d.days == null) return 'Ongoing'
  if (d.days === 0) return 'Today'
  return d.days < 0 ? `Passed ${plural(-d.days, 'day')} ago` : `In ${plural(d.days, 'day')}`
}

const pct = (n: number) => `${Math.round(n)}%`

/** Overview card: the regulation a board has been told to watch, and whether the high-risk systems are ready for it. */
export function ComplianceSummary({ compliance }: { compliance: Compliance }) {
  const s = useMemo(() => summariseCompliance(compliance), [compliance])
  const stage = s.byStage.map((x) => ({ key: x.stage, label: x.stage, value: x.count }))
  return (
    <SummaryCard
      to="compliance"
      title="Regulatory compliance"
      value={full(s.highRisk)}
      valueSuffix="EU high-risk use cases"
      line={
        <>
          <strong>{full(s.highRiskAssessed)}</strong> have an EU AI Act assessment
          {s.euHighRisk ? <> · deadline {when(s.euHighRisk).toLowerCase()}</> : null}
          {s.frameworks.euEnabled === false ? <> · EU AI Act tracking is <strong>off</strong></> : null}
        </>
      }
    >
      {stage.length
        ? <RankTable rows={stage} labelHeading="Stage" valueHeading="Use cases" showChange={false} formatValue={full} pageSize={4} />
        : <p className="pn-pending">No use cases registered.</p>}
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'stage', label: 'By governance stage' },
  { key: 'eu', label: 'By EU AI Act tier' },
  { key: 'level', label: 'By governance level' },
] as const
type View = (typeof VIEWS)[number]['key']

function Breakdown({ s }: { s: ComplianceSummary }) {
  const [view, setView] = useState<View>('stage')
  const level = new Map<string, number>()
  for (const u of s.useCases) level.set(u.governanceLevel ?? 'Not scored', (level.get(u.governanceLevel ?? 'Not scored') ?? 0) + 1)
  const rows = view === 'stage' ? s.byStage.map((x) => ({ key: x.stage, label: x.stage, value: x.count }))
    : view === 'eu' ? s.byEuTier.map((x) => ({ key: x.tier, label: x.tier, value: x.count }))
    : [...level].map(([k, v]) => ({ key: k, label: k, value: v }))
  return (
    <Card
      hideTitle
      title="Use cases"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Break use cases down by" />}
      footer={
        view === 'stage' ? 'Where each use case has got to in the governance lifecycle. A use case still at Register has been recorded but not yet assessed.'
          : view === 'eu' ? '"Unclassified" means no risk classification exists — a regulator treats that as unknown, not low risk.'
          : "Airia's own governance score for each use case."
      }
    >
      {rows.length === 0
        ? <p className="pn-pending">No use cases registered.</p>
        : <RankTable key={view} rows={rows} labelHeading={view === 'stage' ? 'Stage' : view === 'eu' ? 'EU AI Act tier' : 'Level'}
            valueHeading="Use cases" showChange={false} formatValue={full} />}
    </Card>
  )
}

/**
 * Detail page — regulatory compliance status.
 *
 * Splits what Airia can evidence (frameworks tracked, risk classification,
 * assessments, documentation) from what it cannot (legal deadlines, regulator
 * filings, enforcement), and says which is which.
 */
export function CompliancePanel({ compliance }: { compliance: Compliance }) {
  const s = useMemo(() => summariseCompliance(compliance), [compliance])
  const eu = s.euHighRisk

  const deadlines = {
    columns: [
      { key: 'date', label: 'Date', align: 'left' as const },
      { key: 'where', label: 'Jurisdiction', align: 'left' as const },
      { key: 'req', label: 'Requirement', align: 'left' as const },
      { key: 'status', label: 'Status', align: 'left' as const },
      { key: 'tracked', label: 'Tracked in Airia', align: 'left' as const },
    ],
    rows: s.deadlines.map((d) => ({
      date: d.deadline.date ? dayYear(Date.parse(`${d.deadline.date}T00:00:00Z`)) : '—',
      where: d.deadline.jurisdiction,
      req: d.deadline.requirement,
      status: when(d),
      tracked: d.tracked == null ? 'No Airia framework' : d.tracked ? 'Yes' : 'No — framework is off',
    })),
  }

  const frameworks = {
    columns: [
      { key: 'name', label: 'Framework', align: 'left' as const },
      { key: 'type', label: 'Type', align: 'left' as const },
      { key: 'where', label: 'Jurisdiction', align: 'left' as const },
      { key: 'on', label: 'Tracking', align: 'left' as const },
    ],
    rows: [...compliance.frameworks]
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
      .map((f) => ({ name: f.name, type: f.type, where: f.jurisdiction ?? '—', on: f.enabled ? 'On' : 'Off' })),
  }

  const useCases = {
    columns: [
      { key: 'name', label: 'Use case', align: 'left' as const },
      { key: 'stage', label: 'Stage', align: 'left' as const },
      { key: 'eu', label: 'EU AI Act tier', align: 'left' as const },
      { key: 'level', label: 'Governance level', align: 'left' as const },
      { key: 'assess', label: 'Assessments done', align: 'right' as const },
      { key: 'docs', label: 'Documentation', align: 'right' as const },
      { key: 'label', label: 'Nutrition label', align: 'left' as const },
      { key: 'owner', label: 'Owner', align: 'left' as const },
    ],
    // High-risk first, then the least documented: the order a reviewer would work in.
    rows: [...compliance.useCases]
      .sort((a, b) => Number(euTier(b) === 'High risk') - Number(euTier(a) === 'High risk') || (a.completeness ?? -1) - (b.completeness ?? -1))
      .map((u) => ({
        name: u.name, stage: u.stage, eu: euTier(u), level: u.governanceLevel ?? 'Not scored',
        assess: `${u.assessments.filter((a) => a.complete).length} of ${u.assessments.length}`,
        docs: u.completeness == null ? '—' : pct(u.completeness),
        label: u.nutritionLabel ? 'Yes' : 'No', owner: u.owner ?? 'No owner',
      })),
  }

  return (
    <>
      <div className="strip">
        <StatTile label="Frameworks tracked" value={`${full(s.frameworks.enabled)} of ${full(s.frameworks.total)}`} />
        <StatTile label="EU high-risk use cases" value={full(s.highRisk)} />
        <StatTile label="…with an EU AI Act assessment" value={s.highRisk ? `${full(s.highRiskAssessed)} of ${full(s.highRisk)}` : '—'} />
        <StatTile label="Documentation ready" value={s.readiness == null ? '—' : pct(s.readiness)} />
        <StatTile label="Assessments complete" value={`${full(s.assessments.complete)} of ${full(s.assessments.total)}`} />
        <StatTile label="Disclosures active" value={s.disclosures ? `${full(s.disclosures.active)} of ${full(s.disclosures.total)}` : '—'} />
      </div>

      <p className="page__scope">
        <span>
          {eu ? <>The EU AI Act high-risk date ({dayYear(Date.parse(`${eu.deadline.date}T00:00:00Z`))}) is <strong>{when(eu).toLowerCase()}</strong>. </> : null}
          EU AI Act tracking is <strong>{s.frameworks.euEnabled ? 'on' : 'off'}</strong>;
          {' '}<strong>{full(s.highRisk)}</strong> {s.highRisk === 1 ? 'use case classifies' : 'use cases classify'} as high risk and <strong>{full(s.highRiskAssessed)}</strong> {s.highRiskAssessed === 1 ? 'has' : 'have'} a completed EU AI Act assessment.
          {' '}<strong>{full(s.unclassified)}</strong> of {full(s.total)} use cases have no risk classification.
          {' '}Airia does not record regulator filings or enforcement actions.
        </span>
      </p>

      <div className="grid">
        <div className="grid__full">
          <Card
            title="Compliance deadlines"
            footer={<>Reference dates kept in <code>src/data/deadlines.ts</code>, not supplied by Airia. Legislative timelines can change: confirm the current position with counsel.</>}
          >
            <TableView caption="Compliance deadlines" columns={deadlines.columns} rows={deadlines.rows} maxHeight={320} />
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="Frameworks"
            value={`${full(s.frameworks.enabled)} of ${full(s.frameworks.total)}`}
            valueSuffix="tracked"
            footer="A framework adds its obligations to each use case's governance gates only while it is on."
          >
            <TableView caption="Governance frameworks" columns={frameworks.columns} rows={frameworks.rows} maxHeight={260} />
          </Card>
        </div>
        <div className="grid__wide"><Breakdown s={s} /></div>
        <div className="grid__full">
          <Card
            title="Use cases, high risk first"
            footer={`Then least documented first. ${plural(s.fullyDocumented, 'use case')} fully documented, ${plural(s.lowReadiness, 'use case')} under half. ${plural(s.nutritionLabels, 'nutrition label')} published, ${plural(s.approved, 'use case')} approved. Source: GET /v1/governance/usecases and its risk classification, assessment and completeness endpoints.`}
          >
            <TableView caption="Use cases and their compliance status" columns={useCases.columns} rows={useCases.rows} maxHeight={460} />
          </Card>
        </div>
        <div className="grid__full"><ReviewAndMitigate actions={complianceActions(s)} /></div>
      </div>
    </>
  )
}
