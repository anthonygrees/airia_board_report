import type { Board } from '../data/live'
import { summarise, growth } from '../data/inventory'
import { summariseAccountability } from '../data/accountability'
import { summariseFinance } from '../data/finance'
import { summariseSecurity } from '../data/security'
import { summariseCompliance } from '../data/compliance'
import { summariseIncidents } from '../data/incidents'
import { summariseVendors } from '../data/vendors'
import { summariseShadow } from '../data/shadow'
import { full, currency as money } from '../lib/format'
import type { Route } from '../lib/route'

export const DIMENSIONS = [
  ['inventory', 'Inventory', 'Current inventory snapshot'],
  ['accountability', 'Accountability', 'Current ownership; audit history: last 90 days'],
  ['finance', 'Financial', 'Latest 30-day billing window; breakdowns: last 90 days'],
  ['security', 'Cybersecurity', 'Violations: last 90 days; other controls: current snapshot'],
  ['compliance', 'Compliance', 'Current governance snapshot; reference deadlines'],
  ['incidents', 'Incident response', 'Security-event history: last 90 days; readiness: current snapshot'],
  ['vendors', 'Vendor risk', 'Current dependencies; vendor spend: last 90 days'],
  ['shadow', 'Shadow AI', 'Current discovery snapshot; usage: available daily history'],
] as const
export type DimensionId = typeof DIMENSIONS[number][0]
export interface Fact { id: DimensionId; label: string; period: string; value: string; observation: string; source: string; available: boolean }
export interface AnalysisItem { id: DimensionId; statement: string; risk: number | null; actionability: number | null; rationale: string }
export interface Analysis { summary: string; dimensions: AnalysisItem[] }
export interface WindowFilter { from: string; to: string }
export const DEFAULT_WINDOW = { from: '', to: '' }

/** Filter bucket starts, not aggregated values or snapshot populations. No prorating. */
export function windowIndices(x: readonly number[], window: WindowFilter): number[] {
  const from = window.from ? Date.parse(window.from + 'T00:00:00Z') : -Infinity
  const to = window.to ? Date.parse(window.to + 'T00:00:00Z') + 86400000 : Infinity
  return x.flatMap((t, i) => t >= from && t < to ? [i] : [])
}

/** Only aggregate statements go to the analysis service. No keys, names or raw logs. */
export function boardFacts(b: Board): Fact[] {
  const facts: Fact[] = DIMENSIONS.map(([id, label, period]) => ({ id, label, period, value: 'Not available', observation: 'Required source has not loaded or is unavailable.', source: id, available: false }))
  const set = (id: DimensionId, value: string, observation: string, source: string) => Object.assign(facts.find(f => f.id === id)!, { value, observation, source, available: true })
  if (b.agents.status === 'ready') {
    const s = summarise(b.agents.data, 'all')
    set('inventory', full(s.total), `${full(s.executive)} agents can act on systems; ${full(s.byTier.high)} meet the documented high-risk access rule.`, '/v1/AiAssets')
    if (b.audit.status === 'ready') {
      const a = summariseAccountability(b.agents.data, b.audit.data.lifecycle, b.audit.data.access)
      set('accountability', `${full(a.owned)} of ${full(a.agents)}`, `${full(a.executiveUnowned)} agents that can act have no named owner; ${full(a.changes)} recorded lifecycle changes${a.changesTruncated ? ' (truncated log)' : ''}.`, '/v1/AiAssets; /v1/AuditLog/entries')
    }
    if (b.finance.status === 'ready' && b.finance.data.windows.length) {
      const f = summariseFinance(b.finance.data, b.agents.data)
      set('finance', money(f.now.cost), `Latest 30-day spend: ${money(f.now.cost)}; ${(f.reconciled * 100).toFixed(1)}% of 90-day spend traces to current agents.`, '/v1/BillingExecutions/summary; /v1/AiAssets')
    }
  }
  if (b.security.status === 'ready') {
    const s = summariseSecurity(b.security.data)
    if (s.violations !== null) set('security', full(s.violations), `${full(s.violations)} violations in 90 days; sensitive-data violations: ${s.sensitive === null ? 'unknown' : full(s.sensitive)}.`, '/v1/Feed/policy-violations; discovery security reports')
  }
  if (b.compliance.status === 'ready') {
    const c = summariseCompliance(b.compliance.data)
    set('compliance', full(c.highRisk), `${full(c.highRisk)} high-risk or prohibited EU use cases; ${full(c.highRiskAssessed)} have a completed EU AI Act assessment.`, '/v1/governance/usecases; classifications; assessments')
  }
  if (b.incidents.status === 'ready' && b.incidents.data.events !== null) {
    const i = summariseIncidents(b.incidents.data)
    set('incidents', full(i.events), `${full(i.events)} recorded security events${i.truncated ? ' (truncated log)' : ''}; blocked tool actions: ${i.nearMissesStopped === null ? 'unknown' : full(i.nearMissesStopped)}.`, '/v1/AuditLog/entries; security runbooks; discovery reports')
  }
  if (b.discovery.status === 'ready' && b.agents.status === 'ready') {
    const d = b.discovery.data
    if (d.deprecation) {
      const v = summariseVendors(d, b.finance.status === 'ready' ? b.finance.data : null, b.agents.data)
      set('vendors', full(v.overdueModels), `${full(v.overdueModels)} models in the returned list are overdue; vendor ratings are not available from Airia.`, '/v1/discovery/reports/model-deprecation-exposure; billing')
    }
    if (d.kpis || d.apps) {
      const s = summariseShadow(d, b.agents.data)
      set('shadow', full(s.apps), `${full(s.apps)} discovered AI apps; unmanaged apps: ${d.apps ? full(s.unmanagedApps) : 'unknown'}.`, '/v1/discovery/dashboard; /v1/ShadowAiEvents/analytics')
    }
  }
  return facts
}

export const priority = (d: AnalysisItem): number | null => d.risk === null || d.actionability === null ? null : Math.round((.7 * d.risk + .3 * d.actionability) * 20)
export const rankAnalysis = (a: readonly AnalysisItem[]) => [...a].sort((x, y) => (priority(y) ?? -1) - (priority(x) ?? -1) || (y.risk ?? -1) - (x.risk ?? -1) || DIMENSIONS.findIndex(d => d[0] === x.id) - DIMENSIONS.findIndex(d => d[0] === y.id))
export const dimensionRoute = (id: DimensionId): Route => id

export interface PlotEvidence { type: 'line' | 'bar'; labels: string[]; values: number[]; unit: string }
/** Native editable deck charts use the same raw overview series and date selection. */
export function overviewEvidence(b: Board, window: WindowFilter): Partial<Record<DimensionId, PlotEvidence>> {
  const evidence: Partial<Record<DimensionId, PlotEvidence>> = {}
  const times = (id: DimensionId, x: number[], values: number[], unit: string) => {
    const indices = windowIndices(x, window)
    evidence[id] = { type: 'line', labels: indices.map(i => new Date(x[i]).toISOString().slice(0, 10)), values: indices.map(i => values[i]), unit }
  }
  if (b.agents.status === 'ready') {
    const g = growth(b.agents.data); times('inventory', g.map(p => p.at), g.map(p => p.count), 'Agents')
    if (b.audit.status === 'ready') {
      const a = summariseAccountability(b.agents.data, b.audit.data.lifecycle, b.audit.data.access)
      times('accountability', a.weekly.map(p => p.from), a.weekly.map(p => p.count), 'Agent changes')
    }
  }
  if (b.finance.status === 'ready') times('finance', b.finance.data.windows.map(p => p.from), b.finance.data.windows.map(p => p.cost), 'Spend (USD)')
  if (b.security.status === 'ready' && b.security.data.violations) { const p = b.security.data.violations.weeks; times('security', p.map(v => v.from), p.map(v => v.count), 'Violations') }
  if (b.incidents.status === 'ready' && b.incidents.data.events) { const s = summariseIncidents(b.incidents.data); times('incidents', s.weekly.map(p => p.from), s.weekly.map(p => p.count), 'Security events') }
  if (b.discovery.status === 'ready') {
    const p = b.discovery.data.usage
    if (p) times('shadow', p.map(v => v.at), p.map(v => v.events), 'AI tool events')
    if (b.agents.status === 'ready' && b.finance.status === 'ready') {
      const v = summariseVendors(b.discovery.data, b.finance.data, b.agents.data)
      evidence.vendors = { type: 'bar', labels: v.spend.map(p => p.vendor), values: v.spend.map(p => p.cost), unit: 'Spend (USD), source 90-day window' }
    }
  }
  if (b.compliance.status === 'ready') { const c = summariseCompliance(b.compliance.data); evidence.compliance = { type: 'bar', labels: c.byStage.map(s => s.stage), values: c.byStage.map(s => s.count), unit: 'Use cases, snapshot' } }
  return evidence
}

export const ASSUMPTIONS = [
  ['Sources', 'Live Airia GET requests through the existing local proxy. Each source can fail independently. Not available means unknown, never zero or safe.'],
  ['Date filter', 'UTC start dates of returned chart buckets are filtered inclusively by day. Buckets crossing the bounds are not split or prorated. Headline metrics, snapshot tables and source reporting windows remain unchanged. The selected range is sent to AI with this limitation.'],
  ['Coverage', 'Only accessible records are represented. Audit feeds cap pagination and disclose truncation. The existing growth calculation counts agents with unknown creation dates from the beginning of the series. No department or team field is assumed.'],
  ['Definitions', 'Inventory risk tiers follow the existing access-based rules. Ownership is a snapshot. Billing trends use 30-day windows; breakdowns use 90 days. Violations and security events use 90-day history. Discovery controls are snapshots.'],
  ['Priority rubric v1', 'AI-estimated risk (1 low, 5 critical) and actionability (1 difficult, 5 ready to act). Priority = (0.7 × risk + 0.3 × actionability) × 20. Ties use risk, then dimension order. Scores are decision support, not Airia findings. Missing evidence stays unscored.'],
  ['AI processing', 'Disabled by default. Enabling sends only aggregate facts, source windows and the selected chart range to the operator-configured model service. No Airia key, raw audit log or agent names are included. Generated commentary requires human review.'],
  ['Currency & comparisons', 'Money uses the existing billing formatter. Do not infer FX conversion, tax treatment or a comparable period where the source does not provide one.'],
  ['Export', 'CSV contains original values before chart pixel reduction and escapes spreadsheet formulas. PowerPoint contains the current facts, available AI analysis and this methodology. The LG boardbook template is not included in this repository.'],
] as const
