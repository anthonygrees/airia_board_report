import { useCallback, useEffect, useState } from 'react'
import { fetchAgents, type Agent } from '../lib/airia/agents'
import { ACCESS, AUDIT_DAYS, LIFECYCLE, fetchAudit, type AuditFeed } from '../lib/airia/audit'
import { fetchFinance, type Finance } from '../lib/airia/billing'
import { fetchCompliance, type Compliance } from '../lib/airia/compliance'
import { fetchDiscovery, type Discovery } from '../lib/airia/discovery'
import { fetchIncidents, type Incidents } from '../lib/airia/incidents'
import { fetchSecurity, type Security } from '../lib/airia/security'
import type { Connection } from '../lib/airia/endpoint'
import { AuthError } from '../lib/airia/http'

export type Load<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T; at: number }
  | { status: 'rejected'; message: string }
  | { status: 'error'; message: string }

/**
 * Loads one thing for a connection.
 *
 * A rejected key is its own state, not an error: the page answers it by
 * returning to the key gate, whereas any other failure leaves the key alone
 * and offers a retry. Nothing is written to disk — rows live in this tab.
 *
 * `fetcher` must be a stable reference (a module-level function), because
 * the effect re-runs when it changes.
 */
function useLoad<T>(
  conn: Connection | null,
  fetcher: (conn: Connection, signal: AbortSignal) => Promise<T>,
  nonce: number,
): Load<T> {
  const [load, setLoad] = useState<Load<T>>({ status: 'idle' })

  useEffect(() => {
    if (!conn) { setLoad({ status: 'idle' }); return }
    const ctrl = new AbortController()
    setLoad({ status: 'loading' })
    fetcher(conn, ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setLoad({ status: 'ready', data, at: Date.now() }) },
      (err: unknown) => {
        if (ctrl.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Something went wrong.'
        setLoad(err instanceof AuthError ? { status: 'rejected', message } : { status: 'error', message })
      },
    )
    return () => ctrl.abort()
  }, [conn, fetcher, nonce])

  return load
}

export interface Audit { lifecycle: AuditFeed; access: AuditFeed }

async function fetchBoth(conn: Connection, signal: AbortSignal): Promise<Audit> {
  const [lifecycle, access] = await Promise.all([
    fetchAudit(conn, LIFECYCLE, AUDIT_DAYS, signal),
    fetchAudit(conn, ACCESS, AUDIT_DAYS, signal),
  ])
  return { lifecycle, access }
}

export interface Board {
  agents: Load<Agent[]>
  audit: Load<Audit>
  finance: Load<Finance>
  security: Load<Security>
  compliance: Load<Compliance>
  incidents: Load<Incidents>
  discovery: Load<Discovery>
  reload: () => void
  /** The first rejection from any source, so the page can return to the gate. */
  rejected: string | null
}

/** The three sources the board pages read. Each loads — and fails — alone. */
export function useBoard(conn: Connection | null): Board {
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const agents = useLoad(conn, fetchAgents, nonce)
  const audit = useLoad(conn, fetchBoth, nonce)
  const finance = useLoad(conn, fetchFinance, nonce)
  const security = useLoad(conn, fetchSecurity, nonce)
  const compliance = useLoad(conn, fetchCompliance, nonce)
  const incidents = useLoad(conn, fetchIncidents, nonce)
  const discovery = useLoad(conn, fetchDiscovery, nonce)
  const rejected = [agents, audit, finance, security, compliance, incidents, discovery].find((l) => l.status === 'rejected')
  return { agents, audit, finance, security, compliance, incidents, discovery, reload, rejected: rejected?.status === 'rejected' ? rejected.message : null }
}
