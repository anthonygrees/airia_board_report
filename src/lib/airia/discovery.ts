import type { Connection } from './endpoint'
import { getJson, optional } from './http'

/**
 * Everything Airia's Discover surface knows about AI the organisation did not
 * build itself: apps people use, agents found on other platforms, the models
 * and vendors those depend on, and how much of it is under control.
 *
 * Feeds two pages — third-party and vendor risk, and shadow AI — so it is
 * fetched once. Every part is optional: a key that cannot read one report
 * leaves that part of the page saying "not available".
 */

export interface DiscoveredApp {
  name: string
  users: number
  provider: string
  managed: boolean
  risk: string
  firstSeen: number | null
  lastSeen: number | null
}

export interface Finding {
  type: string
  severity: string
  headline: number
  unit: string
  newThisWeek: number
  topApps: { name: string; users: number }[]
}

export interface DeprecatedModel {
  name: string
  /** `overdue`, or whatever the catalog reports. Null when unknown. */
  status: string | null
  /** Negative once past. */
  days: number | null
  agents: number
  executions: number
  spend: number
}

export interface Discovery {
  kpis: { assets: number; newAssets: number; apps: number; newApps: number; devices: number; criticalExposures: number } | null
  findings: Finding[] | null
  usage: { at: number; events: number; users: number; apps: number }[] | null
  apps: DiscoveredApp[] | null
  unmet: { total: number; monitored: number; blocked: number; warned: number; allowed: number } | null
  funnel: {
    discovered: number; securable: number; secured: number; notSecurable: number
    providers: { provider: string; discovered: number; securable: number; secured: number }[]
  } | null
  coverage: {
    connections: number; healthy: number; stale: number
    endpointDevices: number; browserFleet: number; browserCovered: number; telemetrySessions: number
  } | null
  devices: { total: number; enforced: number; observed: number } | null
  deprecation: {
    models: number; agentsAtRisk: number; unknown: number
    burndown: { bucket: string; count: number }[]
    list: DeprecatedModel[]
  } | null
  /** Where discovered models are hosted, against whose model they are. */
  hosting: { host: string; vendor: string; count: number }[] | null
}

type Raw = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])
const time = (v: unknown): number | null => { const t = Date.parse(str(v)); return Number.isFinite(t) ? t : null }

interface Report { metrics?: { key: string; value: unknown }[]; entities?: Raw[] }
const metric = (r: Report | null, key: string): unknown => r?.metrics?.find((m) => m.key === key)?.value

const BURNDOWN_ORDER = ['overdue', '60', '90', 'over90']
const BURNDOWN_LABEL: Record<string, string> = { overdue: 'Already past', '60': 'Within 60 days', '90': 'Within 90 days', over90: 'Beyond 90 days' }

async function fetchHosting(conn: Connection, signal?: AbortSignal): Promise<NonNullable<Discovery['hosting']> | null> {
  const models: Raw[] = []
  for (let page = 1; page <= 10; page++) {
    const body = await optional(getJson<{ items?: Raw[]; totalCount?: number }>(conn, `/v1/Security/inventory?PageNumber=${page}&PageSize=100`, signal))
    if (!body?.items?.length) { if (page === 1) return null; break }
    models.push(...body.items.filter((i) => i.type === 'AiModel'))
    if (page * 100 >= num(body.totalCount)) break
  }
  const counts = new Map<string, { host: string; vendor: string; count: number }>()
  for (const m of models) {
    const host = str(m.provider) || 'Unknown'
    const vendor = str(m.aiProviderNames) || 'Unknown'
    const k = `${host}|${vendor}`
    const c = counts.get(k) ?? { host, vendor, count: 0 }
    c.count++
    counts.set(k, c)
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)
}

export async function fetchDiscovery(conn: Connection, signal?: AbortSignal): Promise<Discovery> {
  const rep = (name: string) => optional(getJson<Report>(conn, `/v1/discovery/reports/${name}`, signal))
  const [summary, findings, usage, apps, unmet, funnel, coverage, devices, dep, hosting] = await Promise.all([
    optional(getJson<Raw>(conn, '/v1/discovery/dashboard/summary', signal)),
    optional(getJson<Raw[]>(conn, '/v1/discovery/dashboard/findings', signal)),
    optional(getJson<{ dataPoints?: Raw[] }>(conn, '/v1/ShadowAiEvents/analytics/usage-over-time', signal)),
    optional(getJson<{ items?: Raw[] }>(conn, '/v1/discovery/dashboard/assets?category=DiscoveredApps&PageNumber=1&PageSize=100', signal)),
    rep('unmet-ai-demand'),
    rep('governance-funnel'),
    rep('coverage-confidence'),
    rep('ungoverned-devices'),
    rep('model-deprecation-exposure'),
    fetchHosting(conn, signal),
  ])

  const kpis = (summary?.kpis ?? null) as Raw | null
  const burn = (metric(dep, 'deprecationBurnDownByThreshold') ?? {}) as Record<string, number>

  return {
    kpis: kpis ? {
      assets: num(kpis.totalAssets), newAssets: num(kpis.newAssetsThisWeek), apps: num(kpis.discoveredAppsCount),
      newApps: num(kpis.newAppsThisWeek), devices: num(kpis.observedDeviceCount), criticalExposures: num(kpis.criticalExposures),
    } : null,
    findings: findings ? arr(findings).map((f) => ({
      type: str(f.findingType), severity: str(f.severity), headline: num(f.headlineValue), unit: str(f.headlineUnit),
      newThisWeek: num(f.newThisWeek),
      topApps: arr((f.impact as Raw | undefined)?.topApps).map((a) => ({ name: str(a.name), users: num(a.userCount) })),
    })) : null,
    usage: usage ? arr(usage.dataPoints).map((p) => ({
      at: Date.parse(`${str(p.date)}T00:00:00Z`), events: num(p.eventCount), users: num(p.uniqueUsers), apps: num(p.uniqueApplications),
    })).filter((p) => Number.isFinite(p.at)).sort((a, b) => a.at - b.at) : null,
    apps: apps ? arr(apps.items).map((a) => ({
      name: str(a.name), users: num(a.userCount), provider: str(a.provider), managed: a.managed === true,
      risk: str(a.riskLevel) || 'None', firstSeen: time(a.firstSeen), lastSeen: time(a.lastSeen),
    })) : null,
    unmet: unmet ? {
      total: num(metric(unmet, 'totalEventCount')), monitored: num(metric(unmet, 'monitoredCount')),
      blocked: num(metric(unmet, 'blockedCount')), warned: num(metric(unmet, 'warnedCount')), allowed: num(metric(unmet, 'allowedCount')),
    } : null,
    funnel: funnel ? {
      discovered: num(metric(funnel, 'discoveredCount')), securable: num(metric(funnel, 'securableCount')),
      secured: num(metric(funnel, 'securedCount')), notSecurable: num(metric(funnel, 'notSecurableCount')),
      providers: arr(metric(funnel, 'providerBreakdown')).map((p) => ({
        provider: str(p.providerName) || str(p.provider), discovered: num(p.discoveredCount),
        securable: num(p.securableCount), secured: num(p.securedCount),
      })),
    } : null,
    coverage: coverage ? {
      connections: num(metric(coverage, 'spmConnectionCount')), healthy: num(metric(coverage, 'spmConnectionHealthyCount')),
      stale: num(metric(coverage, 'spmConnectionStaleOrFailedCount')), endpointDevices: num(metric(coverage, 'endpointDeviceObservedCount')),
      browserFleet: num(metric(coverage, 'browserExtFleetSizeCount')), browserCovered: num(metric(coverage, 'browserExtCoveredCount')),
      telemetrySessions: num(metric(coverage, 'claudeTelemetrySessionCount')),
    } : null,
    devices: devices ? {
      total: num(metric(devices, 'deviceTotalCount')), enforced: num(metric(devices, 'enforcedPolicyCount')), observed: num(metric(devices, 'observedPolicyCount')),
    } : null,
    deprecation: dep ? {
      models: num(metric(dep, 'totalDeprecatingModelsWithDependencies')), agentsAtRisk: num(metric(dep, 'totalAgentsAtRisk')),
      unknown: num(metric(dep, 'modelsWithUnknownDeprecationStatus')),
      burndown: BURNDOWN_ORDER.filter((k) => burn[k] != null).map((k) => ({ bucket: BURNDOWN_LABEL[k] ?? k, count: num(burn[k]) })),
      list: arr(dep.entities).map((e) => {
        const m = (k: string) => arr(e.metrics).find((x) => x.key === k)?.value
        return {
          name: str(e.displayLabel) || str(e.entityKey),
          status: typeof m('deprecationStatus') === 'string' ? (m('deprecationStatus') as string) : null,
          days: typeof m('daysUntilDeprecation') === 'number' ? (m('daysUntilDeprecation') as number) : null,
          agents: num(m('assetDependencyCount')), executions: num(m('executionsInWindow')), spend: num(m('spendAtRiskInWindow')),
        }
      }),
    } : null,
    hosting,
  }
}
