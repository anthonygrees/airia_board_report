import { useMemo, useState } from 'react'
import { Card, RankTable, StatTile, Tabs } from '../components'
import { series } from '../theme/palette'
import { compact, currency, full, percent } from '../lib/format'
import type { Agent } from '../lib/airia/agents'
import type { Finance } from '../lib/airia/billing'
import { QUARTER_DAYS, WINDOW_DAYS } from '../lib/airia/billing'
import { BUCKET_LABEL, BUCKET_NOTE, summariseFinance, type FinanceSummary } from '../data/finance'
import { TIER_LABEL } from '../data/inventory'
import { SummaryCard, Trend, day, plural, ReviewAndMitigate } from './shared'
import { financeActions } from '../data/guidance'

const money = (n: number) => currency(n, n < 100 ? 2 : 0)
const tick = (n: number) => `$${compact(n)}`
const DAY = 24 * 3_600_000

const span = (t: number) => `${day(t)} – ${day(t + WINDOW_DAYS * DAY - 1)}`

/** The change in the latest window, as the reference's tiles show it: direction, size, and against what. */
function delta(s: FinanceSummary) {
  if (s.change == null) return undefined
  const direction = s.change > 0.005 ? 'up' : s.change < -0.005 ? 'down' : 'none'
  return { direction, text: `${Math.abs(s.change * 100).toFixed(0)}%`, vs: `vs previous ${WINDOW_DAYS} days` } as const
}

/** Overview card: what AI costs now, and how much of it can be explained. */
export function FinanceSummary({ finance, agents }: { finance: Finance; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseFinance(finance, agents), [finance, agents])
  const d = delta(s)
  return (
    <SummaryCard
      to="finance"
      title="Financial visibility"
      value={money(s.now.cost)}
      valueSuffix={`AI spend, last ${WINDOW_DAYS} days`}
      line={
        <>
          {d ? <><strong>{d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '·'} {d.text}</strong> {d.vs} · </> : null}
          <strong>{percent(s.reconciled, 0)}</strong> of the last quarter traces to a current agent
        </>
      }
    >
      <Trend x={s.windows.map((w) => w.from)} values={s.windows.map((w) => w.cost)} color={series(1)} label="Spend"
        formatValue={money} formatTick={tick} formatX={span} height={150} />
    </SummaryCard>
  )
}

const VIEWS = [
  { key: 'where', label: 'Where it went' },
  { key: 'tier', label: 'By risk tier' },
  { key: 'agent', label: 'By agent' },
] as const
type View = (typeof VIEWS)[number]['key']

function Breakdown({ s }: { s: FinanceSummary }) {
  const [view, setView] = useState<View>('where')
  const q = s.quarter
  const share = (n: number) => (q.cost > 0 ? percent(n / q.cost, 1) : '—')

  const where = s.byBucket.map(({ bucket, cost }) => ({
    key: bucket,
    label: BUCKET_LABEL[bucket],
    value: cost,
    detail: [{ label: 'What it is', value: BUCKET_NOTE[bucket] }, { label: 'Share of spend', value: share(cost) }],
  }))
  const tier = s.byTier.map((t) => ({
    key: t.tier,
    label: TIER_LABEL[t.tier],
    value: t.cost,
    detail: [{ label: 'Agents with spend', value: full(t.agents) }, { label: 'Share of spend', value: share(t.cost) }],
  }))
  const agent = s.perAgent.map((c, i) => {
    const main = [...c.row.models].sort((a, b) => b.cost - a.cost)[0]
    return {
      key: `${c.row.pipelineId ?? c.row.name}-${i}`,
      label: `${c.agent?.name ?? (c.row.name || 'Unnamed')}${c.bucket === 'unlisted' ? ' (not in inventory)' : ''}`,
      value: c.row.cost,
      detail: [
        { label: 'Risk tier', value: c.tier ? TIER_LABEL[c.tier] : '—' },
        { label: 'Executions', value: full(c.row.executions) },
        { label: 'Per execution', value: c.row.executions ? currency(c.row.cost / c.row.executions, 3) : '—' },
        { label: 'Main model', value: main?.name ?? '—' },
        { label: 'Share of spend', value: share(c.row.cost) },
      ],
    }
  })

  const rows = view === 'where' ? where : view === 'tier' ? tier : agent
  return (
    <Card
      hideTitle
      title="Spend breakdown"
      controls={<Tabs tabs={VIEWS} value={view} onChange={setView} ariaLabel="Break spend down by" />}
      footer={
        view === 'where' ? `The last ${QUARTER_DAYS} days, split into the parts that do and do not trace to an agent. They sum to ${money(q.cost)}.`
          : view === 'tier' ? 'Current agents only, by the risk tier they sit in.'
          : `The last ${QUARTER_DAYS} days, highest first. Hover a row for executions, unit cost and model.`
      }
    >
      {rows.length === 0
        ? <p className="pn-pending">No current agent had spend in this period.</p>
        : <RankTable key={view} rows={rows} labelHeading={view === 'where' ? 'Spend' : view === 'tier' ? 'Risk tier' : 'Agent'}
            valueHeading="Spend" showChange={false} formatValue={money} />}
    </Card>
  )
}

/**
 * Detail page — financial visibility and economics.
 *
 * The measure a finance committee will press on is reconciliation: how much
 * of the spend can be tied to a workflow and an owner. The quarter is split
 * into exactly the parts that can and cannot, and the parts sum to the total.
 */
export function FinancePanel({ finance, agents }: { finance: Finance; agents: readonly Agent[] }) {
  const s = useMemo(() => summariseFinance(finance, agents), [finance, agents])
  const d = delta(s)
  const q = s.quarter
  const gateway = s.byBucket.find((b) => b.bucket === 'gateway')?.cost ?? 0
  const x = s.windows.map((w) => w.from)

  return (
    <>
      <div className="strip">
        <StatTile label={`Spend, last ${WINDOW_DAYS} days`} value={money(s.now.cost)} delta={d}
          trend={s.windows.map((w) => w.cost)} />
        <StatTile label="Cost per execution" value={s.costPerExecution == null ? '—' : currency(s.costPerExecution, 3)} />
        <StatTile label={`Per agent, last ${QUARTER_DAYS} days`} value={s.averagePerAgent == null ? '—' : money(s.averagePerAgent)} />
        <StatTile label="Reconciled to an agent" value={percent(s.reconciled, 0)} />
      </div>

      <p className="page__scope">
        <span>
          Only <strong>{percent(s.reconciled, 0)}</strong> of the last {QUARTER_DAYS} days' {money(q.cost)} traces to a current agent
          {gateway > 0 ? <>; <strong>{money(gateway)}</strong> is gateway traffic tied to no agent</> : null}.
          Return on investment needs the business value of each agent, which Airia does not record, so cost per execution stands in.
        </span>
      </p>

      <div className="grid">
        <div className="grid__wide">
          <Card
            title="AI spend"
            value={money(s.now.cost)}
            valueSuffix={`last ${WINDOW_DAYS} days`}
            table={{
              columns: [
                { key: 'period', label: `${WINDOW_DAYS}-day period` },
                { key: 'spend', label: 'Spend', align: 'right' },
                { key: 'runs', label: 'Executions', align: 'right' },
                { key: 'per', label: 'Per execution', align: 'right' },
              ],
              rows: [...s.windows].reverse().map((w) => ({
                period: span(w.from), spend: money(w.cost), runs: full(w.executions),
                per: w.executions ? currency(w.cost / w.executions, 4) : '—',
              })),
            }}
            footer={<>{plural(s.windows.length, 'period')} of {WINDOW_DAYS} days, UTC · source <code>GET /v1/BillingExecutions/summary</code></>}
          >
            <Trend x={x} values={s.windows.map((w) => w.cost)} color={series(1)} label="Spend"
              formatValue={money} formatTick={tick} formatX={span} />
          </Card>
        </div>
        <div className="grid__wide">
          <Card
            title="Executions"
            value={full(s.now.executions)}
            valueSuffix={`last ${WINDOW_DAYS} days`}
            footer={`Every billed run, per ${WINDOW_DAYS}-day period.`}
          >
            <Trend x={x} values={s.windows.map((w) => w.executions)} color={series(7)} label="Executions"
              formatValue={full} formatX={span} />
          </Card>
        </div>
        <div className="grid__full"><Breakdown s={s} /></div>
        <div className="grid__full"><ReviewAndMitigate actions={financeActions(s)} /></div>
      </div>
    </>
  )
}
