import { createRoot } from 'react-dom/client'
import { ReportWorkspace } from './Workspace'
import { DimensionIcon } from './DimensionIcon'
import { previewBoard } from './fixtures'
import { InventorySummary, InventoryPanel } from '../panels/InventoryPanel'
import { AccountabilitySummary, AccountabilityPanel } from '../panels/AccountabilityPanel'
import { FinanceSummary, FinancePanel } from '../panels/FinancePanel'
import { SecuritySummary, SecurityPanel } from '../panels/SecurityPanel'
import { ComplianceSummary, CompliancePanel } from '../panels/CompliancePanel'
import { IncidentsSummary, IncidentsPanel } from '../panels/IncidentsPanel'
import { VendorsSummary, VendorsPanel } from '../panels/VendorsPanel'
import { ShadowSummary, ShadowPanel } from '../panels/ShadowPanel'
import { useRoute, href } from '../lib/route'
import { DIMENSIONS, type Fact } from './model'
import { useTheme } from '../lib/theme'
import '../theme/tokens.css'
import '../components/kit.css'
import '../app.css'

const board = previewBoard()
/** Offline demonstration of the UI contract. Never used by the live app. */
async function demoAnalysis(payload: unknown, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const input = payload as { mode: string; facts: Fact[]; question?: string }
  if (input.mode === 'question') return { answer: 'Illustrative response: use the ownership and policy-violation panels to review control coverage. This offline demonstration does not reason about arbitrary questions. The production app uses the configured model service.', sources: ['accountability', 'security'] }
  const scores = [[3, 4], [5, 5], [2, 4], [5, 4], [3, 3], [4, 3], [4, 4], [3, 4]]
  return { summary: 'Illustrative analysis: the fixture contains 24 agents, of which 8 have named owners. Review ownership coverage and the sample policy violations first. Confirm assessment and incident-response readiness with the source panels. Scores below are demonstration fixtures, not an assessment of a tenant.', dimensions: input.facts.map((f, i) => ({ id: f.id, statement: 'Demonstration interpretation: ' + f.observation, risk: f.available ? scores[i][0] : null, actionability: f.available ? scores[i][1] : null, rationale: 'Fixed illustrative scores for reviewing the interface. No AI model or live tenant is connected.' })) }
}
function Preview() {
  const route = useRoute(), [theme, setTheme] = useTheme()
  const { agents, audit, finance, security, compliance, incidents, discovery } = board
  if (agents.status !== 'ready' || audit.status !== 'ready' || finance.status !== 'ready' || security.status !== 'ready' || compliance.status !== 'ready' || incidents.status !== 'ready' || discovery.status !== 'ready') return null
  const panels = {
    inventory: <InventoryPanel agents={agents.data} scope="all" />,
    accountability: <AccountabilityPanel agents={agents.data} audit={audit.data} />,
    finance: <FinancePanel agents={agents.data} finance={finance.data} />,
    security: <SecurityPanel security={security.data} />,
    compliance: <CompliancePanel compliance={compliance.data} />,
    incidents: <IncidentsPanel incidents={incidents.data} />,
    vendors: <VendorsPanel discovery={discovery.data} agents={agents.data} finance={finance.data} />,
    shadow: <ShadowPanel discovery={discovery.data} agents={agents.data} />,
  }
  return <main className="page"><header className="page__head"><h1>Airia · Executive AI dashboard</h1><button type="button" className="viz-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button></header><nav className="page__nav" aria-label="Pages"><a className="page__navlink" href={href('overview')} aria-current={route === 'overview' ? 'page' : undefined}>Overview</a>{DIMENSIONS.map(([id, label]) => <a key={id} className="page__navlink" href={href(id)} aria-current={route === id ? 'page' : undefined}><DimensionIcon id={id} />{label}</a>)}</nav><p className="report-note">Offline preview · Synthetic sample data · AI responses and scores are demonstrations, not live model output.</p><ReportWorkspace board={board} overview={route === 'overview'} request={demoAnalysis} preview>
    {route !== 'overview' ? panels[route] : <div className="sumgrid"><InventorySummary agents={agents.data} /><AccountabilitySummary agents={agents.data} audit={audit.data} /><FinanceSummary agents={agents.data} finance={finance.data} /><SecuritySummary security={security.data} /><ComplianceSummary compliance={compliance.data} /><IncidentsSummary incidents={incidents.data} /><VendorsSummary discovery={discovery.data} agents={agents.data} finance={finance.data} /><ShadowSummary discovery={discovery.data} agents={agents.data} /></div>}
  </ReportWorkspace></main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
