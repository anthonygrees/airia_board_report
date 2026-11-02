import type { Agent } from '../lib/airia/agents'
import type { Discovery } from '../lib/airia/discovery'

/**
 * Shadow AI and ungoverned adoption.
 *
 * Two halves. AI that arrives from outside — apps in browsers, agents on
 * other platforms — is measured by what discovery has found and how much of
 * it is under any control. AI built inside Airia is measured by whether it
 * sits inside a governed use case. Airia records no department for an agent,
 * so "which department" cannot be answered; the owner and the platform it
 * runs on are the nearest handles.
 */

export interface ShadowSummary {
  apps: number
  unmanagedApps: number
  newApps: number
  events: number
  /** Share of AI browser traffic that met no active control (only watched). */
  passive: number | null
  /** Airia-built agents outside any governed use case, and unclassified. */
  ungoverned: number
  internal: number
  /** Discovered third-party agents under control, of those that can be. */
  secured: number
  securable: number
  discovered: number
  devicesEnforced: number
  devices: number
  d: Discovery
}

export function summariseShadow(d: Discovery, agents: readonly Agent[]): ShadowSummary {
  const internal = agents.filter((a) => !a.external)
  const ungoverned = internal.filter((a) => a.useCaseCount === 0 && !a.classified).length
  const events = d.unmet?.total ?? 0
  const watched = d.unmet ? d.unmet.monitored + d.unmet.allowed : 0
  return {
    apps: d.kpis?.apps ?? d.apps?.length ?? 0,
    unmanagedApps: d.apps ? d.apps.filter((a) => !a.managed).length : 0,
    newApps: d.kpis?.newApps ?? 0,
    events,
    passive: d.unmet && events > 0 ? watched / events : null,
    ungoverned,
    internal: internal.length,
    secured: d.funnel?.secured ?? 0,
    securable: d.funnel?.securable ?? 0,
    discovered: d.funnel?.discovered ?? 0,
    devicesEnforced: d.devices?.enforced ?? 0,
    devices: d.devices?.total ?? 0,
    d,
  }
}
