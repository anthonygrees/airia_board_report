import type { Connection } from './endpoint'
import { getJson } from './http'

/**
 * What AI costs — from `GET /v1/BillingExecutions/summary`.
 *
 * One call returns spend per pipeline (an agent) for a window, and an
 * `aggregatedTotals` for the whole window however many pages it spans. So:
 *
 *  - the monthly trend is twelve 30-day windows asked for with `PageSize=1`,
 *    reading only the totals — twelve cheap requests, no rows;
 *  - the per-agent breakdown is the latest 90 days, paged by cursor.
 *
 * Gateway traffic comes back as a single row with no pipeline: spend that
 * does not trace to any agent. That row is the reconciliation story, so it
 * is kept rather than filtered out.
 */

const DAY = 24 * 3_600_000
export const WINDOW_DAYS = 30
export const WINDOWS = 12
export const QUARTER_DAYS = 90
const ROW_PAGE = 200
const CONCURRENCY = 4

export interface Window {
  from: number
  to: number
  cost: number
  executions: number
}

export interface CostModel { name: string; provider: string; cost: number }

export interface CostRow {
  /** Null for gateway traffic, which belongs to no agent. */
  pipelineId: string | null
  name: string
  /** `Pipeline`, `Gateway`, `Playground`, `Datasource`… */
  source: string
  executions: number
  cost: number
  models: CostModel[]
}

export interface Finance {
  /** Oldest first; the last is the 30 days ending now. */
  windows: Window[]
  rows: CostRow[]
  quarter: { from: number; to: number; cost: number; executions: number }
}

type Raw = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

interface Totals { totalCost?: number; totalExecutions?: number }
interface Page { items?: Raw[]; nextPageCursor?: string | null; aggregatedTotals?: Totals }

const query = (from: number, to: number, extra: Record<string, string>) =>
  `/v1/BillingExecutions/summary?${new URLSearchParams({
    StartDate: new Date(from).toISOString(), EndDate: new Date(to).toISOString(), ...extra,
  })}`

async function windowTotals(conn: Connection, from: number, to: number, signal?: AbortSignal): Promise<Window> {
  const t = (await getJson<Page>(conn, query(from, to, { PageSize: '1' }), signal)).aggregatedTotals
  return { from, to, cost: num(t?.totalCost), executions: num(t?.totalExecutions) }
}

function toRow(r: Raw): CostRow {
  const models = Array.isArray(r.modelBreakdown) ? (r.modelBreakdown as Raw[]) : []
  return {
    pipelineId: str(r.pipelineId),
    name: str(r.pipelineName) ?? '',
    source: str(r.executionSourceType) ?? 'Unknown',
    executions: num(r.executionCount),
    cost: num(r.totalCost),
    models: models.map((m) => ({ name: str(m.modelName) ?? 'Unknown', provider: str(m.provider) ?? '', cost: num(m.totalCost) })),
  }
}

export async function fetchFinance(conn: Connection, signal?: AbortSignal): Promise<Finance> {
  // The window ends tomorrow's midnight so today's spend is inside it.
  const d = new Date()
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY
  const bounds = Array.from({ length: WINDOWS }, (_, i) => {
    const to = end - (WINDOWS - 1 - i) * WINDOW_DAYS * DAY
    return [to - WINDOW_DAYS * DAY, to] as const
  })

  const windows: Window[] = new Array(bounds.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < bounds.length; i = next++) {
      windows[i] = await windowTotals(conn, bounds[i][0], bounds[i][1], signal)
    }
  }
  const quarterFrom = end - QUARTER_DAYS * DAY
  const rows: CostRow[] = []
  let totals: Totals | undefined
  const paging = async () => {
    let cursor: string | null | undefined
    do {
      const extra: Record<string, string> = { PageSize: String(ROW_PAGE) }
      if (cursor) extra.Cursor = cursor
      const page = await getJson<Page>(conn, query(quarterFrom, end, extra), signal)
      totals ??= page.aggregatedTotals
      for (const r of page.items ?? []) rows.push(toRow(r))
      cursor = page.items?.length ? page.nextPageCursor : null
    } while (cursor)
  }

  await Promise.all([paging(), ...Array.from({ length: CONCURRENCY }, worker)])
  return {
    windows,
    rows,
    quarter: { from: quarterFrom, to: end, cost: num(totals?.totalCost), executions: num(totals?.totalExecutions) },
  }
}
