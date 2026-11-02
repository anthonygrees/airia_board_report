import type { Connection } from './endpoint'
import { getJson } from './http'

/**
 * The agent inventory, from `GET /v1/AiAssets`.
 *
 * One endpoint answers every question the inventory panel asks: each agent
 * arrives with the models, tools, data sources and MCP gateways it is wired
 * to, its owner, the classification assignments on it and the governance use
 * cases it is linked to. Agents Airia hosts (`InternalAgent`) and agents it
 * has discovered on other platforms (`ExternalAgent` — Azure, AWS, n8n,
 * Copilot Studio…) come back in the same list.
 *
 * `assetsFilter` is REQUIRED — leaving it off is a 400, not an empty page.
 *
 * Like every call here it goes through the page's own origin, where the
 * proxy forwards it to the environment named in `x-airia-host`. The key
 * travels in a header only.
 */

const FILTER = 'InternalAgent,ExternalAgent,GovernanceAgent,PersonalAgent'
const PAGE_SIZE = 500

export interface Agent {
  id: string
  /** The id billing and execution records know an Airia-hosted agent by. */
  internalId: string | null
  name: string
  /** Where it runs: `Airia`, or the platform it was discovered on. */
  platform: string
  /** Discovered on another platform rather than built in Airia. */
  external: boolean
  owner: string | null
  description: string | null
  createdAt: number | null
  models: string[]
  tools: string[]
  dataSources: string[]
  mcpGateways: string[]
  /** Lifetime executions. Only Airia-hosted agents report it. */
  executions: number | null
  useCaseCount: number
  /** Carries a classification with a label assigned or inferred. */
  classified: boolean
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Names from a list of `{ name, id }` references; an unnamed one still counts. */
const refs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((r) => str((r as { name?: unknown } | null)?.name) ?? 'Unnamed') : []

const PLATFORMS: Record<string, string> = {
  AzureFoundry: 'Azure AI Foundry',
  AwsBedrock: 'AWS Bedrock',
  CopilotStudio: 'Copilot Studio',
  N8n: 'n8n',
  N8N: 'n8n',
}
const platformName = (v: string): string => PLATFORMS[v] ?? v.replace(/([a-z])([A-Z])/g, '$1 $2')

type Raw = Record<string, unknown>

function toAgent(r: Raw): Agent | null {
  const id = str(r.id)
  if (!id) return null
  const external = r.assetType !== 'InternalAgent'
  const classifications = Array.isArray(r.classifications) ? (r.classifications as Raw[]) : []
  const created = typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN
  return {
    id,
    internalId: str(r.internalId),
    name: str(r.name) ?? 'Unnamed agent',
    platform: platformName(str(r.platform) ?? str(r.source) ?? 'Unknown'),
    external,
    owner: str(r.ownerName) ?? str(r.owner),
    description: str(r.description),
    createdAt: Number.isFinite(created) ? created : null,
    models: refs(r.models),
    tools: refs(r.tools),
    dataSources: refs(r.dataSources),
    mcpGateways: refs(r.mcpGatewayDeployments),
    executions: typeof r.executionCount === 'number' ? r.executionCount : null,
    useCaseCount: Array.isArray(r.useCaseIds) ? r.useCaseIds.length : 0,
    classified: classifications.some((c) => c.assignedClassificationLabelId != null || c.inferredClassificationLabelId != null),
  }
}

async function page(conn: Connection, n: number, signal?: AbortSignal): Promise<{ items: Raw[]; total: number }> {
  const body = await getJson<{ assets?: { items?: Raw[]; totalCount?: number } }>(
    conn, `/v1/AiAssets?PageNumber=${n}&PageSize=${PAGE_SIZE}&assetsFilter=${FILTER}`, signal,
  )
  return { items: body.assets?.items ?? [], total: body.assets?.totalCount ?? 0 }
}

/** Every agent in the tenant, however many pages that takes. */
export async function fetchAgents(conn: Connection, signal?: AbortSignal): Promise<Agent[]> {
  const seen = new Map<string, Agent>()
  for (let n = 1; ; n++) {
    const { items, total } = await page(conn, n, signal)
    for (const r of items) {
      const a = toAgent(r)
      if (a) seen.set(a.id, a)
    }
    if (items.length === 0 || n * PAGE_SIZE >= total) break
  }
  return [...seen.values()]
}
