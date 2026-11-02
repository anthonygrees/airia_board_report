/**
 * Regulatory dates a board tracks.
 *
 * THESE ARE NOT FROM AIRIA. Airia records which frameworks a tenant tracks
 * and how its use cases stand against them; it holds no calendar of legal
 * deadlines, and it records neither regulatory enforcement actions nor
 * disclosures filed with a regulator — those are legal events that happen
 * outside the platform. The dates below are reference data, kept here so the
 * page can say how far away each one is and whether the tenant is tracking
 * the framework it belongs to.
 *
 * Legislative timelines can move. Confirm the current position with counsel
 * and edit this list; nothing else on the page needs to change.
 */
export interface Deadline {
  /** ISO date, UTC. Null for an obligation that is continuous, not dated. */
  date: string | null
  jurisdiction: string
  requirement: string
  /** The Airia framework key that covers it, or null if Airia has none. */
  framework: string | null
}

export const DEADLINES: readonly Deadline[] = [
  { date: '2025-02-02', jurisdiction: 'EU', requirement: 'EU AI Act: prohibited practices, AI literacy', framework: 'eu-ai-act' },
  { date: '2025-08-02', jurisdiction: 'EU', requirement: 'EU AI Act: general-purpose AI model rules', framework: 'eu-ai-act' },
  { date: '2026-08-02', jurisdiction: 'EU', requirement: 'EU AI Act: high-risk systems (Annex III)', framework: 'eu-ai-act' },
  { date: '2027-08-02', jurisdiction: 'EU', requirement: 'EU AI Act: high-risk in regulated products', framework: 'eu-ai-act' },
  { date: null, jurisdiction: 'US', requirement: 'SEC 8-K Item 1.05: material cyber incidents, 4 business days', framework: null },
]

const DAY = 24 * 3_600_000

/** Whole days from `now` to the deadline: negative once it has passed. Null if undated. */
export function daysUntil(d: Deadline, now = Date.now()): number | null {
  if (!d.date) return null
  return Math.ceil((Date.parse(`${d.date}T00:00:00Z`) - now) / DAY)
}
