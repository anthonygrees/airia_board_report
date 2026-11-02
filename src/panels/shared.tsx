import { DimensionIcon } from '../report/DimensionIcon'
import { useReport } from '../report/context'
import type { DimensionId } from '../report/model'
import type { ReactNode } from 'react'
import { Card, LineChart, TableView } from '../components'
import { compact } from '../lib/format'
import { href, type Route } from '../lib/route'
import type { Load } from '../data/live'
import type { Action } from '../data/guidance'
import './panels.css'

/**
 * One line with its area wash, drawn by the kit's `LineChart` — the same
 * chart, axes and hover readout as the gateway-usage dashboard. A single
 * series, so the line takes one palette slot and the legend stays out.
 */
export function Trend(props: {
  x: readonly number[]
  values: readonly number[]
  color: string
  label: string
  height?: number
  /** Tooltip and hero formatting: "$1,238.40". */
  formatValue: (n: number) => string
  /** Axis formatting, shorter: "$1.2K". */
  formatTick?: (n: number) => string
  /** Names the x position in the readout. */
  formatX: (t: number) => string
}) {
  const { x, values, color, label, height = 176, formatValue, formatTick = (n) => compact(n), formatX } = props
  return (
    <LineChart
      x={x}
      height={height}
      formatValue={formatValue}
      formatTick={formatTick}
      formatX={formatX}
      // The key becomes part of an SVG gradient reference, so it must be a plain token:
      // a space in it breaks `url(#…)` and the area renders solid black.
      series={[{ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, color, values, reducer: 'max', area: true }]}
    />
  )
}

/** A summary card that opens its detail page. */
export function SummaryCard(props: {
  to: Route
  title: string
  value: string
  valueSuffix: string
  /** The one line that says why a director should care. */
  line: ReactNode
  children: ReactNode
}) {
  const { to, title, value, valueSuffix, line, children } = props
  const { analysis } = useReport()
  const statement = analysis?.dimensions.find(d => d.id === to)?.statement
  return (
    <div className="sum">
      <Card
        title={title}
        controls={<DimensionIcon id={to as DimensionId} />}
        value={value}
        valueSuffix={valueSuffix}
        footer={<a className="sum__go" href={href(to)}>View detail <span aria-hidden="true">→</span></a>}
      >
        <p className="pn-sum__line">{line}</p>
        {children}
        {statement ? <p className="report-comment"><span>AI interpretation</span>{statement}</p> : null}
      </Card>
    </div>
  )
}

/** Stands in for a card or page while its data loads or has failed. */
export function Pending({ title, load, onRetry }: { title: string; load: Load<unknown>; onRetry: () => void }) {
  return (
    <Card title={title}>
      {load.status === 'error' ? (
        <p className="pn-pending" role="alert">
          {load.message}{' '}
          <button type="button" className="page__link" onClick={onRetry}>Try again</button>
        </p>
      ) : (
        <p className="pn-pending" role="status">Loading…</p>
      )}
    </Card>
  )
}

/** Plain-language counts: "1 agent", "3 agents". */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString()} ${n === 1 ? one : many}`

export const when = (t: number): string =>
  new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const day = (t: number): string => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export const dayYear = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export type { Action }

/**
 * The end of every detail page: what to review, and how Airia can mitigate it.
 *
 * Rows are chosen by the page's own data, so a gap that does not exist does
 * not get advice. The mitigations name capabilities of the platform; whether
 * a given key is permitted to use them is a matter for the tenant's roles.
 */
export function ReviewAndMitigate({ actions }: { actions: readonly Action[] }) {
  const columns = [
    { key: 'review', label: 'What to review', align: 'left' as const },
    { key: 'mitigate', label: 'How to mitigate with Airia', align: 'left' as const },
  ]
  return (
    <Card
      title="What to review and how to mitigate with Airia"
      footer="Shown only where the data above points to a gap. Mitigations are Airia capabilities; what each person can use depends on their role in the tenant."
    >
      {actions.length
        ? <div className="pn-wrapall"><TableView caption="What to review and how to mitigate" columns={columns} rows={actions.map((a) => ({ review: a.review, mitigate: a.mitigate }))} maxHeight={520} /></div>
        : <p className="pn-pending">Nothing on this page needs action.</p>}
    </Card>
  )
}
