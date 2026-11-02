import { DimensionIcon } from './report/DimensionIcon'
import type { DimensionId } from './report/model'
import { ReportWorkspace } from './report/Workspace'
import { useEffect, useState } from 'react'
import { KeyGate, Tabs, Toolbar, ToolbarButton } from './components'
import { Moon, Sun } from './components/primitives/icons'
import { InventoryPanel, InventorySummary, SCOPES } from './panels/InventoryPanel'
import { AccountabilityPanel, AccountabilitySummary } from './panels/AccountabilityPanel'
import { FinancePanel, FinanceSummary } from './panels/FinancePanel'
import { SecurityPanel, SecuritySummary } from './panels/SecurityPanel'
import { CompliancePanel, ComplianceSummary } from './panels/CompliancePanel'
import { IncidentsPanel, IncidentsSummary } from './panels/IncidentsPanel'
import { VendorsPanel, VendorsSummary } from './panels/VendorsPanel'
import { ShadowPanel, ShadowSummary } from './panels/ShadowPanel'
import { Pending } from './panels/shared'
import { useBoard, type Load } from './data/live'
import type { Scope } from './data/inventory'
import { useApiKey, maskKey, lastHost } from './lib/apiKey'
import { fetchTenantName } from './lib/airia/tenant'
import { envName } from './lib/airia/endpoint'
import { useTheme } from './lib/theme'
import { href, useRoute, type Route } from './lib/route'

const PAGES: readonly { route: Route; label: string }[] = [
  { route: 'overview', label: 'Overview' },
  { route: 'inventory', label: 'Inventory' },
  { route: 'accountability', label: 'Accountability' },
  { route: 'finance', label: 'Finance' },
  { route: 'security', label: 'Security' },
  { route: 'compliance', label: 'Compliance' },
  { route: 'incidents', label: 'Incidents' },
  { route: 'vendors', label: 'Vendors' },
  { route: 'shadow', label: 'Shadow AI' },
]

/** The first of these that is not ready, or null when all are. */
const notReady = (...loads: Load<unknown>[]): Load<unknown> | null => loads.find((l) => l.status !== 'ready') ?? null

/**
 * The Executive AI Dashboard.
 *
 * An overview of one summary card per board question; each opens a detail
 * page with the grain. Each section loads — and can fail — on its own, so a
 * slow billing query never holds up the inventory.
 */
export default function App() {
  const [theme, setTheme] = useTheme()
  const { key, host, conn, setKey, clear, remember } = useApiKey()
  const board = useBoard(conn)
  const route = useRoute()
  const [scope, setScope] = useState<Scope>('all')
  const [tenant, setTenant] = useState<string | null>(null)

  useEffect(() => {
    if (!conn) { setTenant(null); return }
    const ctrl = new AbortController()
    void fetchTenantName(conn, ctrl.signal).then((n) => { if (!ctrl.signal.aborted) setTenant(n) })
    return () => ctrl.abort()
  }, [conn])

  const title = (
    <h1>
      {tenant ? <><span className="page__tenant">{tenant}</span><span className="viz-sr-only"> · </span></> : null}
      Executive AI dashboard
    </h1>
  )

  // No key, or the one held was refused: the gate, with the reason.
  if (!key || board.rejected) {
    const loading = [board.agents, board.audit, board.finance, board.security, board.compliance, board.incidents, board.discovery].some((l) => l.status === 'loading')
    return (
      <div className="page">
        <header className="page__head">{title}</header>
        <KeyGate
          onSubmit={(k, persist, h) => setKey(k, persist, h)}
          initialHost={key ? host : lastHost()}
          busy={key && loading ? 'Loading…' : null}
          error={board.rejected}
        />
      </div>
    )
  }

  const { agents, audit, finance, security, compliance, incidents, discovery, reload } = board
  const pending = (name: string, ...loads: Load<unknown>[]) => {
    const l = notReady(...loads)
    return l ? <Pending title={name} load={l} onRetry={reload} /> : null
  }

  let body
  if (route === 'inventory') {
    body = pending('AI agent inventory & risk classification', agents)
      ?? (agents.status === 'ready' && <InventoryPanel agents={agents.data} scope={scope} />)
  } else if (route === 'accountability') {
    body = pending('Accountability & ownership', agents, audit)
      ?? (agents.status === 'ready' && audit.status === 'ready' && <AccountabilityPanel agents={agents.data} audit={audit.data} />)
  } else if (route === 'finance') {
    body = pending('Financial visibility & economics', agents, finance)
      ?? (agents.status === 'ready' && finance.status === 'ready' && <FinancePanel agents={agents.data} finance={finance.data} />)
  } else if (route === 'security') {
    body = pending('Cybersecurity & data governance', security)
      ?? (security.status === 'ready' && <SecurityPanel security={security.data} />)
  } else if (route === 'compliance') {
    body = pending('Regulatory compliance', compliance)
      ?? (compliance.status === 'ready' && <CompliancePanel compliance={compliance.data} />)
  } else if (route === 'incidents') {
    body = pending('Incident response & near-misses', incidents)
      ?? (incidents.status === 'ready' && <IncidentsPanel incidents={incidents.data} />)
  } else if (route === 'vendors') {
    body = pending('Third-party & vendor risk', agents, discovery)
      ?? (agents.status === 'ready' && discovery.status === 'ready'
        && <VendorsPanel discovery={discovery.data} agents={agents.data} finance={finance.status === 'ready' ? finance.data : null} />)
  } else if (route === 'shadow') {
    body = pending('Shadow AI & ungoverned adoption', agents, discovery)
      ?? (agents.status === 'ready' && discovery.status === 'ready' && <ShadowPanel discovery={discovery.data} agents={agents.data} />)
  } else {
    body = (
      <div className="sumgrid">
        {pending('AI agent inventory', agents)
          ?? (agents.status === 'ready' && <InventorySummary agents={agents.data} />)}
        {pending('Accountability & ownership', agents, audit)
          ?? (agents.status === 'ready' && audit.status === 'ready' && <AccountabilitySummary agents={agents.data} audit={audit.data} />)}
        {pending('Financial visibility', agents, finance)
          ?? (agents.status === 'ready' && finance.status === 'ready' && <FinanceSummary agents={agents.data} finance={finance.data} />)}
        {pending('Cybersecurity & data governance', security)
          ?? (security.status === 'ready' && <SecuritySummary security={security.data} />)}
        {pending('Regulatory compliance', compliance)
          ?? (compliance.status === 'ready' && <ComplianceSummary compliance={compliance.data} />)}
        {pending('Incident response & near-misses', incidents)
          ?? (incidents.status === 'ready' && <IncidentsSummary incidents={incidents.data} />)}
        {pending('Third-party & vendor risk', agents, discovery)
          ?? (agents.status === 'ready' && discovery.status === 'ready'
            && <VendorsSummary discovery={discovery.data} agents={agents.data} finance={finance.status === 'ready' ? finance.data : null} />)}
        {pending('Shadow AI & ungoverned adoption', agents, discovery)
          ?? (agents.status === 'ready' && discovery.status === 'ready' && <ShadowSummary discovery={discovery.data} agents={agents.data} />)}
      </div>
    )
  }

  const loadedAt = [agents, audit, finance, security, compliance, incidents, discovery].flatMap((l) => (l.status === 'ready' ? [l.at] : []))
  return (
    <div className="page">
      <header className="page__head">
        {title}
        <nav className="page__nav" aria-label="Pages">
          {PAGES.map((p) => (
            <a
              key={p.route}
              className="page__navlink"
              href={href(p.route)}
              aria-current={route === p.route ? 'page' : undefined}
            >
              {p.route !== 'overview' ? <DimensionIcon id={p.route as DimensionId} /> : null}{p.label}
            </a>
          ))}
        </nav>
      </header>

      <Toolbar
        actions={
          <>
            <span className="viz-keychip">
              <span title={host}>{envName(host)}</span>
              <code>{maskKey(key)}</code>
              {remember ? null : <span title="Held in memory only">· this tab</span>}
              <button type="button" onClick={clear}>Change key</button>
            </span>
            <ToolbarButton
              icon={theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </ToolbarButton>
          </>
        }
      >
        {route === 'inventory'
          ? <Tabs tabs={SCOPES} value={scope} onChange={setScope} ariaLabel="Agents to include" />
          : null}
      </Toolbar>

      <ReportWorkspace key={host + key} board={board} overview={route === 'overview'}>{body}</ReportWorkspace>

      <p className="page__note">
        {loadedAt.length ? <>Loaded {new Date(Math.max(...loadedAt)).toLocaleTimeString()} · </> : null}
        <button type="button" className="page__link" onClick={reload}>Refresh</button>. Figures stay in this tab unless you export them or enable AI analysis.
        AI analysis sends aggregate facts to the configured model service.
      </p>
    </div>
  )
}
