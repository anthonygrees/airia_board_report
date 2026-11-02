import type { Connection } from './endpoint'
import { getJson, mapLimit, optional } from './http'

/**
 * Where the organisation stands against the frameworks it answers to.
 *
 * Airia models this per use case: each carries a lifecycle stage, a risk
 * classification against the EU AI Act, NIST AI RMF and ISO/IEC 42001, a set
 * of assessments, and a documentation-completeness figure. Those three are a
 * request each, so a tenant with N use cases costs 3N small requests —
 * fanned out narrowly, and each allowed to fail on its own (an unclassified
 * use case answers 404, which is itself the finding).
 */

const CONCURRENCY = 6
const MAX_USE_CASES = 100

export interface Framework {
  key: string
  name: string
  type: string
  jurisdiction: string | null
  enabled: boolean
}

export interface Assessment {
  framework: string
  status: string
  complete: boolean
}

export interface UseCase {
  id: string
  name: string
  stage: string
  governanceLevel: string | null
  autonomy: string | null
  owner: string | null
  agents: number
  nutritionLabel: boolean
  approved: boolean
  pendingTasks: number
  /** EU AI Act tier, or null when the use case has no risk classification. */
  euAiAct: string | null
  nistTier: string | null
  isoLevel: string | null
  /** 0–100, or null when unreadable. */
  completeness: number | null
  assessments: Assessment[]
}

export interface Compliance {
  frameworks: Framework[]
  useCases: UseCase[]
  disclosures: { total: number; active: number } | null
}

type Raw = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])

export async function fetchCompliance(conn: Connection, signal?: AbortSignal): Promise<Compliance> {
  const [frameworks, list, disclosures] = await Promise.all([
    getJson<Raw[]>(conn, '/v1/governance/frameworks', signal),
    getJson<{ items?: Raw[] }>(conn, `/v1/governance/usecases?PageNumber=1&PageSize=${MAX_USE_CASES}`, signal),
    optional(getJson<Raw[]>(conn, '/v1/governance/disclosures', signal)),
  ])

  const useCases = await mapLimit(arr(list.items), CONCURRENCY, async (u): Promise<UseCase> => {
    const id = String(u.id)
    const [risk, done, assessed] = await Promise.all([
      optional(getJson<Raw>(conn, `/v1/governance/usecases/${id}/risk-classifications/active`, signal)),
      optional(getJson<Raw>(conn, `/v1/governance/usecases/${id}/completeness/summary`, signal)),
      optional(getJson<{ items?: Raw[] }>(conn, `/v1/governance/usecases/${id}/assessments`, signal)),
    ])
    return {
      id,
      name: str(u.name) ?? 'Untitled use case',
      stage: str(u.stageName) ?? str(u.stage) ?? 'Unknown',
      governanceLevel: str(u.governanceLevel),
      autonomy: str(u.autonomy),
      owner: str(u.ownerName),
      agents: typeof u.agentCount === 'number' ? u.agentCount : 0,
      nutritionLabel: u.hasNutritionLabel === true,
      approved: u.approvedVersionId != null,
      pendingTasks: typeof u.pendingTaskCount === 'number' ? u.pendingTaskCount : 0,
      euAiAct: risk ? str(risk.euAiAct) : null,
      nistTier: risk ? str(risk.nistAiRmfTier) : null,
      isoLevel: risk ? str(risk.iso42001Level) : null,
      completeness: typeof done?.overallPercent === 'number' ? done.overallPercent : null,
      assessments: arr(assessed?.items).map((a) => ({
        framework: str(a.frameworkKey) ?? 'other', status: str(a.status) ?? 'Unknown', complete: a.isComplete === true,
      })),
    }
  })

  return {
    frameworks: arr(frameworks).map((f) => ({
      key: String(f.key), name: str(f.name) ?? String(f.key), type: str(f.type) ?? 'Other',
      jurisdiction: str(f.jurisdiction), enabled: f.isEnabled === true,
    })),
    useCases,
    disclosures: disclosures ? { total: disclosures.length, active: disclosures.filter((d) => d.isActive === true).length } : null,
  }
}
