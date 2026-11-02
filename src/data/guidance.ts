import { currency, percent } from '../lib/format'
import { AUDIT_DAYS } from '../lib/airia/audit'
import { QUARTER_DAYS } from '../lib/airia/billing'
import type { Summary as InventorySummary } from './inventory'
import type { AccountabilitySummary } from './accountability'
import type { FinanceSummary } from './finance'
import type { SecuritySummary } from './security'
import type { ComplianceSummary } from './compliance'
import type { IncidentSummary } from './incidents'
import type { VendorSummary } from './vendors'
import type { ShadowSummary } from './shadow'

/**
 * What to review, and how Airia can mitigate it — one list per page.
 *
 * Every row is conditional on the page's own numbers, and the review text
 * carries them, so the advice reads as a consequence of what is on screen
 * rather than a standing checklist. The mitigations are capabilities of the
 * platform, said at the level of the feature rather than a menu path.
 */

export interface Action { review: string; mitigate: string }

const n = (x: number) => x.toLocaleString()
const money = (x: number) => currency(x, x < 100 ? 2 : 0)
const pct = (x: number) => percent(x, 0)
const when = (cond: boolean, a: Action): Action[] => (cond ? [a] : [])

const GATEWAY = 'Route their traffic through an AI Gateway, so DLP, guardrails and audit apply without changing the agent.'
const OWNER = "Assign an owner in each agent's governance attributes (Airia can auto-fill owner and nutrition-label fields for a person to confirm), or place agents under a group with a named leader."

export function inventoryActions(s: InventorySummary): Action[] {
  return [
    ...when(s.executiveNoOwner > 0, {
      review: `${n(s.executiveNoOwner)} agents that can act on systems have no named owner. Confirm who answers for each, starting with the ${n(s.byTier.high)} high-risk ones.`,
      mitigate: OWNER,
    }),
    ...when(s.executive > 0, {
      review: `${n(s.executive)} agents hold tools or MCP gateways. Check each tool is needed, and that nothing can write or send where it should only read.`,
      mitigate: 'Add agent constraints (policies) that block or audit tool calls by condition, and expose tools through the MCP Gateway so credentials are managed in one place.',
    }),
    ...when(s.byTier.high > 0, {
      review: `${n(s.byTier.high)} high-risk agents combine action with company data. Check which data sources each can reach.`,
      mitigate: 'Attach DLP and prompt-injection guardrails to these agents, and limit each data source to the projects and groups that need it.',
    }),
    ...when(s.classified < s.total, {
      review: `${n(s.total - s.classified)} of ${n(s.total)} agents have no risk classification, so their risk is a guess.`,
      mitigate: 'Create governance use cases for them, run the AI risk classification, and link the agents so each passes the lifecycle gates.',
    }),
    ...when(s.byTier.unassessed > 0, {
      review: `${n(s.byTier.unassessed)} agents run outside Airia and cannot be assessed. Unknown is not the same as safe.`,
      mitigate: 'Connect the platforms they run on in Security Posture Management so their tools and data become visible, then route their traffic through an AI Gateway.',
    }),
  ]
}

export function accountabilityActions(s: AccountabilitySummary): Action[] {
  const admins = s.actors.filter((a) => a.role === 'platform-admin').length
  return [
    ...when(s.executiveUnowned > 0, {
      review: `${n(s.executiveUnowned)} agents that can act have no named owner. Start with the list above, highest risk first.`,
      mitigate: OWNER,
    }),
    ...when(admins > 0 && admins >= Math.max(3, Math.ceil(s.actors.length * 0.5)), {
      review: `${n(admins)} of the ${n(s.actors.length)} people who changed agents hold the platform-admin role. Check whether each needs that much access.`,
      mitigate: 'Assign least-privilege roles (Admin, Security Admin, End User) and grant project access through groups, so only a few people can publish or deploy.',
    }),
    ...when(s.changes > 0, {
      review: `Scan the ${n(s.changes)} agent changes in ${AUDIT_DAYS} days for a publish or deploy nobody recognises, and any deletion without a reason.`,
      mitigate: 'Put a governance workflow approval gate before deployment, and export the audit log to your SIEM so the record outlives platform retention.',
    }),
    ...when(s.access.total > 0, {
      review: `${n(s.access.total)} access changes (keys, credentials, roles) in ${AUDIT_DAYS} days. Confirm each was approved and that unused keys are gone.`,
      mitigate: 'Revoke unused API keys and credentials, review role assignments, and alert on new keys through the SIEM integration.',
    }),
  ]
}

export function financeActions(s: FinanceSummary): Action[] {
  const cost = (b: string) => s.byBucket.find((x) => x.bucket === b)?.cost ?? 0
  const q = s.quarter.cost
  const gateway = cost('gateway')
  const unlisted = cost('unlisted')
  return [
    ...when(gateway > 0, {
      review: `${money(gateway)} (${q ? pct(gateway / q) : '—'}) of the last ${QUARTER_DAYS} days is gateway traffic that traces to no agent. Find out which applications and people are behind it.`,
      mitigate: 'Issue a separate gateway API key for each application and turn on spend attribution, so every request is tied to an app and a user.',
    }),
    ...when(unlisted > 0, {
      review: `${money(unlisted)} was billed to agents the inventory does not list. Confirm whether they are system agents or deleted ones.`,
      mitigate: 'Link or retire them in the inventory, and set project budgets so spend on unlisted agents stays visible.',
    }),
    {
      review: s.change != null && s.change > 0.25
        ? `Spend rose ${pct(s.change)} on the previous period. Check the top agents by cost per execution.`
        : 'Check the top agents by cost per execution, and whether the most expensive model is needed for each.',
      mitigate: 'Set project and gateway budgets with an alert threshold and a hard stop; move heavy agents to a lower-cost model, enable prompt caching and trim conversation memory.',
    },
    {
      review: 'Return on investment cannot be calculated: no business value is recorded for any agent.',
      mitigate: 'Define a custom asset attribute for business value or hours saved, fill it in for each agent, and divide it by the spend shown here.',
    },
  ]
}

const SECURITY_GUIDE: Record<string, string> = {
  'Content guardrails': 'Create DLP, prompt-injection and moderation guardrails and assign them to agents, data sources and tools.',
  'Tool-call policy': 'Create agent constraints with a Block action for risky tool calls, starting with the audit-only ones that fire most.',
  'Adversarial testing': 'Run a red-teaming campaign against your highest-risk agents using OWASP-aligned attack datasets, and turn its recommendations into guardrails.',
  'Discovered agents secured': GATEWAY.replace('their', "a discovered agent's"),
  'Agent identity and access': 'Connect each platform in Security Posture Management so access settings are read, then require sign-in and agent authentication where they are missing.',
  'Credentials on devices': 'Use the endpoint agent to point provider endpoints at the AI Gateway and replace raw provider keys with gateway keys; rotate any key that was exposed.',
  'MCP servers sanctioned': 'Sanction approved MCP servers, route them through the MCP Gateway, and enforce an endpoint policy for the rest.',
  'Conversation data retention': 'Set a conversation retention period in Data Retention settings, and restrict conversation details to the originating user where appropriate.',
}

export function securityActions(s: SecuritySummary): Action[] {
  return [
    ...when((s.sensitive ?? 0) > 0, {
      review: `${n(s.sensitive ?? 0)} detections of personal, payment, health or secret data in the last 90 days. See which type and which agents trigger most, and whether they were blocked or only logged.`,
      mitigate: 'Set the guardrail action to Block for personal, payment and secret data, tune the noisiest custom filters, and put agents behind the AI Gateway so the same guardrails cover every call.',
    }),
    ...s.controls.filter((c) => c.posture !== 'In place' && SECURITY_GUIDE[c.control]).map((c) => ({
      review: `${c.control}: ${c.detail}.`,
      mitigate: SECURITY_GUIDE[c.control],
    })),
  ]
}

export function complianceActions(s: ComplianceSummary): Action[] {
  const stage = (name: string) => s.byStage.find((x) => x.stage === name)?.count ?? 0
  const disclosures = s.disclosures
  return [
    ...when(s.frameworks.euEnabled === false, {
      review: "EU AI Act tracking is off, so its obligations are not on any use case's governance gates.",
      mitigate: 'Enable the EU AI Act framework in Governance; its obligations are then added to the stage gates of every use case.',
    }),
    ...when(s.highRisk > s.highRiskAssessed, {
      review: `${n(s.highRisk - s.highRiskAssessed)} of ${n(s.highRisk)} EU high-risk use cases have no completed EU AI Act assessment.`,
      mitigate: 'Attach the EU AI Act assessment template to each use case and let Airia auto-complete a first draft for a person to review and approve; attach evidence as artifacts.',
    }),
    ...when(s.unclassified > 0, {
      review: `${n(s.unclassified)} of ${n(s.total)} use cases have no risk classification. A regulator treats an unassessed system as unknown.`,
      mitigate: 'Run the AI risk classification on each; it records the EU AI Act tier, NIST tier and ISO/IEC 42001 level.',
    }),
    ...when(s.readiness != null && s.readiness < 100, {
      review: `Documentation is ${Math.round(s.readiness ?? 0)}% complete on average, and ${n(s.lowReadiness)} use cases are under half.`,
      mitigate: "Complete each use case's nutrition label (Airia can auto-fill from its linked agents), upload the supporting artifacts, and finish the assessments.",
    }),
    ...when(stage('Register') > 0, {
      review: `${n(stage('Register'))} use cases are still at Register: recorded, but not yet assessed.`,
      mitigate: 'Move them through triage and assessment with the governance workflow, and set stage gates and approvers so none is approved without evidence.',
    }),
    ...when(!!disclosures && disclosures.active < disclosures.total, {
      review: `${n((disclosures?.total ?? 0) - (disclosures?.active ?? 0))} of ${n(disclosures?.total ?? 0)} point-of-use disclosures are not active.`,
      mitigate: 'Activate them, so people are told they are dealing with AI wherever transparency rules require it.',
    }),
    {
      review: 'Regulator filings, enforcement actions and legal deadlines are not recorded in Airia.',
      mitigate: "Keep them in your legal or GRC system, and export each use case's receipt, audit trail and assessments from Airia as the evidence pack.",
    },
  ]
}

const INCIDENT_GUIDE: Record<string, string> = {
  'Response playbooks defined': 'Create a runbook (an automated security playbook) that fires on the events that matter and takes defined actions such as notifying and blocking.',
  'Playbooks exercised': 'Run the runbook on demand from the catalog as a drill, then review its execution receipt.',
  'Near-misses stopped': 'Move agent constraints from Audit to Block, so a near-miss is stopped and not only recorded.',
  'Threat detection on discovered agents': 'Connect the platforms your agents run on in Security Posture Management so threat-detection events can be raised.',
  'Endpoint remediations applied': 'Switch the endpoint policy from observe to enforce, so corrective actions are applied and not only proposed.',
  'Exposures still open': 'Rotate the exposed keys, remove them from the files, and use gateway keys on devices instead.',
  'Time to remediate': 'Export the audit log to your SIEM and ticketing system, so opened and closed times are recorded where they can be measured.',
  'Tabletop exercises and lessons learned': 'Run the exercise against the runbook, then record the outcome as an artifact on the governance use case so the evidence is kept.',
}

export function incidentActions(s: IncidentSummary): Action[] {
  return s.readiness.filter((c) => c.posture !== 'In place' && INCIDENT_GUIDE[c.control]).map((c) => ({
    review: `${c.control}: ${c.detail}.`,
    mitigate: INCIDENT_GUIDE[c.control],
  }))
}

export function vendorActions(s: VendorSummary): Action[] {
  const d = s.d
  const dep = d.deprecation
  const past = dep?.burndown.find((b) => b.bucket === 'Already past')?.count ?? 0
  const gap = s.spend.find((v) => !v.attributed)
  return [
    ...when(!!s.topVendor, {
      review: `${s.topVendor?.vendor} carries ${pct(s.topVendor?.share ?? 0)} of spend. Decide what happens if it is unavailable or changes its price.`,
      mitigate: "Use the AI Gateway to route and fall back across providers, so one vendor's outage does not stop agents.",
    }),
    ...when(!!gap, {
      review: `${pct(gap?.share ?? 0)} of spend cannot be tied to a vendor because it is gateway traffic with no model recorded.`,
      mitigate: 'Give each application its own gateway key and keep request logging on, so spend can be attributed to a model and vendor.',
    }),
    ...when(past > 0, {
      review: `${n(past)} models are past their deprecation date and reach ${n(dep?.agentsAtRisk ?? 0)} agents. Start with the models that the most agents rely on.`,
      mitigate: 'Swap the model on the affected agents and republish; run an evaluation on the old and new versions first to confirm quality holds.',
    }),
    ...when(!!d.coverage && d.coverage.stale > 0, {
      review: `${n(d.coverage?.stale ?? 0)} of ${n(d.coverage?.connections ?? 0)} third-party platform connections are stale or failing. What they should be reporting is going unseen.`,
      mitigate: 'Reconnect them and refresh their credentials in Security Posture Management so discovery keeps running.',
    }),
    ...when(!!d.funnel && d.funnel.secured < d.funnel.securable, {
      review: `${n((d.funnel?.securable ?? 0) - (d.funnel?.secured ?? 0))} third-party agents that can be secured are not.`,
      mitigate: GATEWAY.replace('their', "each third-party agent's"),
    }),
    {
      review: 'Airia holds no vendor security ratings, so rating trends and fourth-party scoring are not on this page.',
      mitigate: 'Run the vendor assessment template on each critical vendor as part of governance, and keep ratings in your vendor-risk tool.',
    },
  ]
}

export function shadowActions(s: ShadowSummary): Action[] {
  const c = s.d.coverage
  return [
    ...when(s.unmanagedApps > 0, {
      review: `${n(s.unmanagedApps)} AI apps are in use and unmanaged. Decide for each: approve, replace or block.`,
      mitigate: 'Set the Shadow AI browser policy (block, warn, monitor or redirect by domain), and block unapproved apps network-wide from the AI app catalog.',
    }),
    ...when(s.events > 0 && (s.passive ?? 0) > 0.5, {
      review: `${n(s.events)} browser events to AI tools were only watched. Decide which apps people should be warned about or redirected from.`,
      mitigate: 'Change those rules from Monitor to Warn or Redirect, sending people to a sanctioned Airia agent that does the same job.',
    }),
    ...when(!!c && c.browserCovered < c.browserFleet, {
      review: `The browser extension covers ${n(c?.browserCovered ?? 0)} of ${n(c?.browserFleet ?? 0)} devices, so most browser use is unseen.`,
      mitigate: 'Deploy the extension to every device through your device management.',
    }),
    ...when(s.devices > s.devicesEnforced, {
      review: `${n(s.devices - s.devicesEnforced)} of ${n(s.devices)} devices are not under an enforced policy.`,
      mitigate: 'Enrol devices in MDM and set the endpoint agent policy to enforce.',
    }),
    ...when(s.securable > s.secured, {
      review: `${n(s.securable - s.secured)} agents on other platforms can be secured and are not.`,
      mitigate: GATEWAY.replace('their', "each discovered agent's"),
    }),
    ...when(s.ungoverned > 0, {
      review: `${n(s.ungoverned)} of ${n(s.internal)} Airia-built agents sit outside a governed use case.`,
      mitigate: 'Link them to governed use cases and classify them; use attribute auto-fill to catch up quickly.',
    }),
    {
      review: 'Airia records no department for an agent, so adoption cannot be reported by department.',
      mitigate: 'Create a custom asset attribute for department and fill it in for each agent, so ungoverned adoption can be tracked by department.',
    },
  ]
}
