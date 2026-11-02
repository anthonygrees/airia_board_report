import type { Compliance, UseCase } from '../lib/airia/compliance'
import { DEADLINES, daysUntil, type Deadline } from './deadlines'

/**
 * Compliance, as a board reads it: which frameworks are tracked, how far each
 * use case has got through governance, and whether the paperwork a regulator
 * would ask for exists.
 *
 * A use case with no risk classification is counted as Unclassified, not as
 * low risk — a regulator treats an unassessed system as unknown.
 */

export const STAGE_ORDER = ['Register', 'Triage', 'Assess', 'Mitigate', 'Approve', 'Monitor'] as const

export const EU_TIER_LABEL: Record<string, string> = {
  Prohibited: 'Prohibited',
  UnacceptableRisk: 'Prohibited',
  HighRisk: 'High risk',
  LimitedRisk: 'Limited risk',
  MinimalRisk: 'Minimal risk',
  NotApplicable: 'Not applicable',
}
export const EU_TIER_ORDER = ['Prohibited', 'High risk', 'Limited risk', 'Minimal risk', 'Not applicable', 'Unclassified']

export const euTier = (u: UseCase): string => (u.euAiAct == null ? 'Unclassified' : EU_TIER_LABEL[u.euAiAct] ?? u.euAiAct)

export interface DeadlineRow {
  deadline: Deadline
  days: number | null
  /** Whether the tenant tracks the framework this belongs to. */
  tracked: boolean | null
}

export interface ComplianceSummary {
  frameworks: { total: number; enabled: number; euEnabled: boolean | null }
  useCases: UseCase[]
  total: number
  byStage: { stage: string; count: number }[]
  byEuTier: { tier: string; count: number }[]
  unclassified: number
  highRisk: number
  /** High-risk use cases with a completed assessment against the EU AI Act. */
  highRiskAssessed: number
  assessments: { total: number; complete: number; euTotal: number; euComplete: number }
  /** Mean documentation completeness over use cases that report it. */
  readiness: number | null
  fullyDocumented: number
  lowReadiness: number
  nutritionLabels: number
  approved: number
  disclosures: Compliance['disclosures']
  deadlines: DeadlineRow[]
  /** The EU high-risk date, which is the one a board has been told to watch. */
  euHighRisk: DeadlineRow | null
}

export function summariseCompliance(c: Compliance, now = Date.now()): ComplianceSummary {
  const euAssessed = (u: UseCase) => u.assessments.some((a) => a.framework === 'eu-ai-act' && a.complete)
  const stages = new Map<string, number>()
  const tiers = new Map<string, number>()
  for (const u of c.useCases) {
    stages.set(u.stage, (stages.get(u.stage) ?? 0) + 1)
    tiers.set(euTier(u), (tiers.get(euTier(u)) ?? 0) + 1)
  }
  const all = c.useCases.flatMap((u) => u.assessments)
  const eu = all.filter((a) => a.framework === 'eu-ai-act')
  const scores = c.useCases.flatMap((u) => (u.completeness == null ? [] : [u.completeness]))
  const high = c.useCases.filter((u) => euTier(u) === 'High risk' || euTier(u) === 'Prohibited')
  const eaa = c.frameworks.find((f) => f.key === 'eu-ai-act')

  const deadlines = DEADLINES.map((deadline): DeadlineRow => ({
    deadline,
    days: daysUntil(deadline, now),
    tracked: deadline.framework ? c.frameworks.find((f) => f.key === deadline.framework)?.enabled ?? false : null,
  }))

  return {
    frameworks: { total: c.frameworks.length, enabled: c.frameworks.filter((f) => f.enabled).length, euEnabled: eaa ? eaa.enabled : null },
    useCases: c.useCases,
    total: c.useCases.length,
    byStage: [...stages].map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => (STAGE_ORDER as readonly string[]).indexOf(a.stage) - (STAGE_ORDER as readonly string[]).indexOf(b.stage) || b.count - a.count),
    byEuTier: [...tiers].map(([tier, count]) => ({ tier, count }))
      .sort((a, b) => EU_TIER_ORDER.indexOf(a.tier) - EU_TIER_ORDER.indexOf(b.tier)),
    unclassified: tiers.get('Unclassified') ?? 0,
    highRisk: high.length,
    highRiskAssessed: high.filter(euAssessed).length,
    assessments: {
      total: all.length, complete: all.filter((a) => a.complete).length,
      euTotal: eu.length, euComplete: eu.filter((a) => a.complete).length,
    },
    readiness: scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null,
    fullyDocumented: scores.filter((x) => x >= 100).length,
    lowReadiness: scores.filter((x) => x < 50).length,
    nutritionLabels: c.useCases.filter((u) => u.nutritionLabel).length,
    approved: c.useCases.filter((u) => u.approved).length,
    disclosures: c.disclosures,
    deadlines,
    euHighRisk: deadlines.find((d) => d.deadline.framework === 'eu-ai-act' && d.deadline.date === '2026-08-02') ?? null,
  }
}
