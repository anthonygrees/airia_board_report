import type { Connection } from './endpoint'
import { getJson, mapLimit, optional } from './http'

/**
 * The security and data-governance picture, from eight sources.
 *
 * None of them is essential on its own, so each is `optional`: a key that
 * cannot read one of them leaves that part of the page saying "not available"
 * rather than blanking the section. The numbers a board reads are all counts
 * the API already holds, so most calls ask for `Limit=1` and read only the
 * total — about thirty small requests rather than tens of thousands of rows.
 */

const DAY = 24 * 3_600_000
export const VIOLATION_DAYS = 90
export const VIOLATION_WEEKS = 13
const CONCURRENCY = 4

/**
 * Violation types, in the API's own order. The type filter is a bit set where
 * bit i is the i-th type after `None` — checked against a sample item per bit,
 * and the per-type counts sum to the overall total.
 */
export const VIOLATION_TYPES = [
  'PCI', 'PHI', 'PII', 'PromptSecurity', 'Secrets', 'CustomDetector', 'KeywordDetector',
  'HtmlSanitization', 'Moderation', 'UrlSanitization', 'AgentMisalignment', 'PythonFilter', 'SystemPromptAdherence',
] as const
export type ViolationType = (typeof VIOLATION_TYPES)[number]

export interface Security {
  /** Discovered agents (Security Posture), not Airia-hosted ones. */
  agents: {
    total: number; highRisk: number; securable: number; secured: number
    ownershipGap: number; needsAnalysis: number; analysisFailed: number
  } | null
  /** Access settings the discovery reports, over the agents that report them. */
  access: {
    agents: number; visible: number; webBrowsing: number; autonomous: number
    signInRequired: number; orgWide: number; publicly: number; agentToAgent: number; withAuth: number
  } | null
  violations: {
    weeks: { from: number; count: number }[]
    last90: number; prev90: number; allTime: number
    byType: { type: ViolationType; count: number }[]
  } | null
  tools: { total: number; audited: number; blocked: number; observeOnlyConstraints: number } | null
  credentials: { total: number; devices: number; byProvider: { provider: string; count: number }[] } | null
  mcp: { total: number; servers: { name: string; devices: number; sanctioned: boolean }[] } | null
  apps: { app: string; users: number; events: number }[] | null
  guardrailsActive: number | null
  redTeamCampaigns: number | null
  retention: { conversationDays: number | null; restrictedToOriginator: boolean } | null
}

type Raw = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])

interface Report { metrics?: { key: string; value: unknown }[] }
const metric = (r: Report, key: string): unknown => r.metrics?.find((m) => m.key === key)?.value

async function violationTotal(conn: Connection, from: number, to: number, flags: number | null, signal?: AbortSignal): Promise<number> {
  const p = new URLSearchParams({ Limit: '1', StartTime: String(from), EndTime: String(to) })
  if (flags != null) p.set('ViolationItemTypeFlags', String(flags))
  return num((await getJson<Raw>(conn, `/v1/Feed/policy-violations?${p}`, signal)).totalCount)
}

async function fetchViolations(conn: Connection, now: number, signal?: AbortSignal): Promise<NonNullable<Security['violations']>> {
  const span = VIOLATION_DAYS * DAY
  const weekStarts = Array.from({ length: VIOLATION_WEEKS }, (_, i) => now - (VIOLATION_WEEKS - i) * 7 * DAY)
  type Job = () => Promise<number>
  const jobs: Job[] = [
    () => violationTotal(conn, now - span, now, null, signal),
    () => violationTotal(conn, now - 2 * span, now - span, null, signal),
    () => violationTotal(conn, 0, now, null, signal),
    ...weekStarts.map((from) => () => violationTotal(conn, from, from + 7 * DAY, null, signal)),
    ...VIOLATION_TYPES.map((_, i) => () => violationTotal(conn, now - span, now, 1 << i, signal)),
  ]
  const r = await mapLimit(jobs, CONCURRENCY, (job) => job())
  return {
    last90: r[0], prev90: r[1], allTime: r[2],
    weeks: weekStarts.map((from, i) => ({ from, count: r[3 + i] })),
    byType: VIOLATION_TYPES.map((type, i) => ({ type, count: r[3 + VIOLATION_WEEKS + i] })).filter((t) => t.count > 0),
  }
}

async function fetchAgents(conn: Connection, signal?: AbortSignal): Promise<Pick<Security, 'agents' | 'access'>> {
  const [stats, recs] = await Promise.all([
    optional(getJson<Raw>(conn, '/v1/Security/stats', signal)),
    optional(getJson<Raw>(conn, '/v1/Security/recommendations/summary', signal)),
  ])
  const items: Raw[] = []
  for (let page = 1; page <= 10; page++) {
    const body = await optional(getJson<{ items?: Raw[]; totalCount?: number }>(conn, `/v1/Security/inventory?PageNumber=${page}&PageSize=100`, signal))
    if (!body?.items?.length) break
    items.push(...body.items)
    if (items.length >= num(body.totalCount)) break
  }
  const spm = items.filter((i) => i.type === 'SpmAgent')
  const has = (i: Raw, k: string) => i[k] != null
  const yes = (k: string) => spm.filter((i) => i[k] === true).length
  return {
    agents: stats ? {
      total: num(stats.totalAgentsCount), highRisk: num(stats.highRiskAgentsCount),
      securable: num(stats.securableAgentsCount), secured: num(stats.securedAgentsCount),
      ownershipGap: num(recs?.ownershipGapCount), needsAnalysis: num(recs?.needsAnalysisCount), analysisFailed: num(recs?.analysisFailedCount),
    } : null,
    access: spm.length ? {
      agents: spm.length,
      // An agent "reports" its access settings when it says whether it is shared org-wide.
      visible: spm.filter((i) => has(i, 'orgWideAccessible')).length,
      webBrowsing: yes('webBrowsingCapability'), autonomous: yes('isAutonomous'),
      signInRequired: yes('requireUsersToSignIn'), orgWide: yes('orgWideAccessible'),
      publicly: yes('publiclyAccessible'), agentToAgent: yes('agentToAgentEnabled'),
      withAuth: spm.filter((i) => has(i, 'authenticationMode') || has(i, 'agentAuthenticationSetting')).length,
    } : null,
  }
}

export async function fetchSecurity(conn: Connection, signal?: AbortSignal): Promise<Security> {
  const now = Date.now()
  const [agents, violations, guardrail, cred, mcp, apps, center, red, retention] = await Promise.all([
    fetchAgents(conn, signal),
    optional(fetchViolations(conn, now, signal)),
    optional(getJson<Report>(conn, '/v1/discovery/reports/guardrail-effectiveness', signal)),
    optional(getJson<Report>(conn, '/v1/discovery/reports/credential-exposure', signal)),
    optional(getJson<Report>(conn, '/v1/discovery/reports/shadow-mcp-register', signal)),
    optional(getJson<{ apps?: Raw[] }>(conn, '/v1/ShadowAiEvents/analytics/top-apps?limit=10', signal)),
    optional(getJson<Raw>(conn, '/v1/SecurityCenter/summary', signal)),
    optional(getJson<{ totalCount?: number }>(conn, '/v1/RedTeamingCampaign/summaries', signal)),
    optional(getJson<Raw>(conn, '/v1/DataRetentionSettings', signal)),
  ])

  const byProvider = new Map<string, number>()
  for (const r of arr(cred ? metric(cred, 'register') : null)) {
    const p = str(r.provider) || 'unknown'
    byProvider.set(p, (byProvider.get(p) ?? 0) + 1)
  }

  return {
    ...agents,
    violations,
    tools: guardrail ? {
      total: num(metric(guardrail, 'totalToolCallCount')), audited: num(metric(guardrail, 'auditedToolCallCount')),
      blocked: num(metric(guardrail, 'blockedToolCallCount')), observeOnlyConstraints: num(metric(guardrail, 'observeOnlyConstraintCount')),
    } : null,
    credentials: cred ? {
      total: num(metric(cred, 'totalExposureCount')), devices: num(metric(cred, 'devicesWithExposureCount')),
      byProvider: [...byProvider].map(([provider, count]) => ({ provider, count })).sort((a, b) => b.count - a.count),
    } : null,
    mcp: mcp ? {
      total: num(metric(mcp, 'totalServerCount')),
      servers: arr(metric(mcp, 'mcpServerRegister')).map((s) => ({
        name: str(s.displayName) || str(s.canonicalKey), devices: num(s.deviceCount), sanctioned: s.sanctioned === true,
      })),
    } : null,
    apps: apps ? arr(apps.apps).map((a) => ({ app: str(a.sourceApplication), users: num(a.uniqueUserCount), events: num(a.eventCount) })) : null,
    guardrailsActive: center ? num(center.activeGuardrailsCount) : null,
    redTeamCampaigns: red ? num(red.totalCount) : null,
    retention: retention ? {
      conversationDays: typeof retention.conversationDataRetentionDays === 'number' ? retention.conversationDataRetentionDays : null,
      restrictedToOriginator: retention.restrictConversationDetailsToOriginatingUserOnly === true,
    } : null,
  }
}
