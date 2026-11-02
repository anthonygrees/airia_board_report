import type { Security, ViolationType } from '../lib/airia/security'

/**
 * What a board needs from security, said in its own terms.
 *
 * Counts only — no verdicts the API does not give. Where the platform cannot
 * see something (most discovered agents do not report their access settings)
 * the figure says "of N that report it", never counts the unknown as safe.
 */

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  PCI: 'Payment card data',
  PHI: 'Health data',
  PII: 'Personal data',
  PromptSecurity: 'Prompt injection and jailbreak attempts',
  Secrets: 'Secrets and credentials',
  CustomDetector: 'Custom detectors',
  KeywordDetector: 'Blocked keywords',
  HtmlSanitization: 'Unsafe HTML',
  Moderation: 'Harmful content',
  UrlSanitization: 'Unsafe links',
  AgentMisalignment: 'Agent misalignment',
  PythonFilter: 'Custom code filters',
  SystemPromptAdherence: 'System prompt adherence',
}

/** Types that mean sensitive data reached, or nearly reached, a model. */
const SENSITIVE: readonly ViolationType[] = ['PCI', 'PHI', 'PII', 'Secrets']

export type Posture = 'In place' | 'Partial' | 'Gap' | 'Unknown'

export interface Control {
  control: string
  posture: Posture
  detail: string
  /** Why a director should care, in a line. */
  why: string
}

export interface SecuritySummary {
  violations: number | null
  /** Change against the 90 days before, or null with no base. */
  change: number | null
  sensitive: number | null
  injection: number | null
  weeks: { from: number; count: number }[]
  toolCalls: Security['tools']
  /** Share of tool calls only observed, not enforced. */
  observedOnly: number | null
  agents: Security['agents']
  credentials: Security['credentials']
  unsanctionedMcp: number | null
  controls: Control[]
  raw: Security
}

const n = (x: number) => x.toLocaleString()

export function summariseSecurity(s: Security): SecuritySummary {
  const v = s.violations
  const t = s.tools
  const a = s.agents
  const ax = s.access
  const count = (type: ViolationType) => v?.byType.find((x) => x.type === type)?.count ?? 0
  const unsanctioned = s.mcp ? s.mcp.servers.filter((x) => !x.sanctioned).length : null

  const controls: Control[] = []
  if (s.guardrailsActive != null) {
    controls.push({
      control: 'Content guardrails',
      posture: s.guardrailsActive > 0 ? 'In place' : 'Gap',
      detail: `${n(s.guardrailsActive)} active`,
      why: 'Stops sensitive data and unsafe content before it reaches or leaves a model.',
    })
  }
  if (t) {
    const enforced = t.total > 0 ? t.blocked / t.total : 0
    controls.push({
      control: 'Tool-call policy',
      posture: t.total === 0 ? 'Unknown' : t.blocked > 0 && enforced > 0.05 ? 'In place' : 'Partial',
      detail: t.total === 0 ? 'No tool calls recorded' : `${n(t.blocked)} blocked, ${n(t.audited)} only audited, of ${n(t.total)} calls`,
      why: 'An agent that can act is only controlled if policy can stop an action, not just log it.',
    })
  }
  if (s.redTeamCampaigns != null) {
    controls.push({
      control: 'Adversarial testing',
      posture: s.redTeamCampaigns > 0 ? 'In place' : 'Gap',
      detail: `${n(s.redTeamCampaigns)} red-team ${s.redTeamCampaigns === 1 ? 'campaign' : 'campaigns'} run`,
      why: 'Attackers now use AI at scale. Resilience that has never been tested is unknown, not safe.',
    })
  }
  if (a) {
    controls.push({
      control: 'Discovered agents secured',
      posture: a.securable === 0 ? 'Unknown' : a.secured === 0 ? 'Gap' : a.secured >= a.securable ? 'In place' : 'Partial',
      detail: `${n(a.secured)} of ${n(a.securable)} securable, ${n(a.highRisk)} high risk`,
      why: 'Agents built on other platforms are routed through Airia controls only when secured.',
    })
  }
  if (ax) {
    controls.push({
      control: 'Agent identity and access',
      posture: ax.visible === 0 ? 'Unknown' : ax.visible >= ax.agents ? 'In place' : 'Partial',
      detail: `Access settings visible for ${n(ax.visible)} of ${n(ax.agents)} discovered agents`,
      why: 'You cannot govern who or what an agent can reach if the platform cannot see its settings.',
    })
  }
  if (s.credentials) {
    controls.push({
      control: 'Credentials on devices',
      posture: s.credentials.total === 0 ? 'In place' : 'Gap',
      detail: `${n(s.credentials.total)} AI keys in plain text on ${n(s.credentials.devices)} ${s.credentials.devices === 1 ? 'device' : 'devices'}`,
      why: 'A key left in a shell file lets anyone with the device act as the agent, at the owner’s spend.',
    })
  }
  if (s.mcp) {
    controls.push({
      control: 'MCP servers sanctioned',
      posture: unsanctioned === 0 ? 'In place' : 'Partial',
      detail: `${n(unsanctioned ?? 0)} of ${n(s.mcp.total)} servers on devices are unsanctioned`,
      why: 'Each MCP server is a path from an AI tool into company systems, chosen by whoever installed it.',
    })
  }
  if (s.retention) {
    controls.push({
      control: 'Conversation data retention',
      posture: s.retention.conversationDays != null ? 'In place' : 'Gap',
      detail: s.retention.conversationDays != null ? `Kept ${n(s.retention.conversationDays)} days` : 'No retention limit set',
      why: 'Data kept indefinitely stays exposed indefinitely, and discoverable in a dispute.',
    })
  }

  return {
    violations: v?.last90 ?? null,
    change: v && v.prev90 > 0 ? (v.last90 - v.prev90) / v.prev90 : null,
    sensitive: v ? SENSITIVE.reduce((sum, ty) => sum + count(ty), 0) : null,
    injection: v ? count('PromptSecurity') : null,
    weeks: v?.weeks ?? [],
    toolCalls: t,
    observedOnly: t && t.total > 0 ? (t.total - t.blocked) / t.total : null,
    agents: a,
    credentials: s.credentials,
    unsanctionedMcp: unsanctioned,
    controls,
    raw: s,
  }
}
