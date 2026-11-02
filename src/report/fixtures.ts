/** Synthetic fixtures for the downloadable preview and regression tests only. */
import type { Board, Load } from '../data/live'
import type { Agent } from '../lib/airia/agents'
export function previewBoard(now = Date.now()): Board {
  const day = 86400000
  const ready = <T,>(data: T): Load<T> => ({ status: 'ready', data, at: now })
  const agents: Agent[] = Array.from({ length: 24 }, (_, i) => ({ id: `demo-${i}`, internalId: `demo-pipeline-${i}`, name: `Illustrative agent ${i + 1}`, platform: i % 4 === 0 ? 'External demo' : 'Airia', external: i % 4 === 0, owner: i % 3 === 0 ? 'Demo owner' : null, description: null, createdAt: now - (90 - i * 3) * day, models: ['Demo model'], tools: i % 2 ? ['Demo tool'] : [], dataSources: i % 3 ? ['Demo data source'] : [], mcpGateways: [], executions: i * 4, useCaseCount: i % 2, classified: i % 2 === 0 }))
  const emptyFeed = { events: [], total: 0, truncated: false }
  return {
    agents: ready(agents), audit: ready({ lifecycle: emptyFeed, access: emptyFeed }),
    finance: ready({ windows: Array.from({ length: 12 }, (_, i) => ({ from: now - (12 - i) * 30 * day, to: now - (11 - i) * 30 * day, cost: [240, 320, 280, 490, 360, 310, 290, 280, 530, 740, 1390, 878][i], executions: 400 + i * 80 })), rows: [], quarter: { from: now - 90 * day, to: now, cost: 3008, executions: 3800 } }),
    security: ready({ agents: null, access: null, violations: { weeks: [4, 12, 30, 6, 40, 19, 8, 12, 6, 24, 36, 11, 18].map((count, i) => ({ from: now - (13 - i) * 7 * day, count })), last90: 226, prev90: 180, allTime: 910, byType: [{ type: 'PII', count: 70 }, { type: 'PromptSecurity', count: 156 }] }, tools: { total: 540, audited: 510, blocked: 30, observeOnlyConstraints: 1 }, credentials: null, mcp: null, apps: null, guardrailsActive: 3, redTeamCampaigns: null, retention: null }),
    compliance: ready({ frameworks: [{ key: 'eu-ai-act', name: 'EU AI Act', type: 'regulatory', jurisdiction: 'EU', enabled: true }], useCases: [], disclosures: null }),
    incidents: ready({ events: emptyFeed, runbooks: { total: 2, active: 1 }, runs: { total: 0, failed: 0 }, threats: null, tools: { total: 540, audited: 510, blocked: 30 }, remediations: null, exposures: null, sla: null }),
    discovery: ready({ kpis: { assets: 30, newAssets: 2, apps: 12, newApps: 1, devices: 8, criticalExposures: 0 }, findings: [], usage: [10, 20, 34, 15, 35, 49, 29, 18, 5, 9].map((events, i) => ({ at: now - (10 - i) * day, events, users: 3, apps: 2 })), apps: [], unmet: { total: 540, monitored: 300, allowed: 100, blocked: 100, warned: 40 }, funnel: null, coverage: null, devices: null, deprecation: { models: 2, agentsAtRisk: 3, unknown: 0, burndown: [{ bucket: 'Already past', count: 1 }], list: [{ name: 'Retiring demo model', status: 'overdue', days: -5, agents: 3, executions: 200, spend: 30 }] }, hosting: null }),
    rejected: null, reload: () => {},
  }
}
