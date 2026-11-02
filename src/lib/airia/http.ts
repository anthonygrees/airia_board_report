import { airiaHeaders, type Connection } from './endpoint'

/**
 * One way to call the Airia API from the page.
 *
 * The API sends no Access-Control-Allow-Origin header, so every call goes to
 * `/airia/...` on this origin and the local proxy forwards it to the
 * environment named in `x-airia-host`. The key travels in a header only,
 * never in a URL.
 */

export class AuthError extends Error {}

const TIMEOUT_MS = 60_000

/** `path` starts at the API version: `/v1/AiAssets?...`. */
export async function getJson<T>(conn: Connection, path: string, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(`/airia${path}`, { signal: ctrl.signal, headers: airiaHeaders(conn) })
    if (res.status === 401 || res.status === 403) {
      throw new AuthError(`The key was rejected by ${conn.host} (HTTP ${res.status}).`)
    }
    // The proxy answers 400 itself for a host it will not forward to, and 502
    // when the host could not be reached; Airia answers 400 for a bad query.
    // Both say why.
    if (res.status === 400 || res.status === 502) {
      const why = await res.json().then(
        (b) => b?.error ?? (b?.errors ? Object.values(b.errors).flat().join(' ') : b?.title),
        () => null,
      )
      throw new Error(typeof why === 'string' && why ? why : `Could not reach ${conn.host} (HTTP ${res.status}).`)
    }
    if (!res.ok) throw new Error(`The request failed (HTTP ${res.status}).`)
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) throw err
      throw new Error('The request timed out.')
    }
    // A CORS or network failure surfaces as an opaque TypeError.
    if (err instanceof TypeError) throw new Error('Could not reach the API through this origin. Is the proxy running?')
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Runs `fn` over `items` at most `limit` at a time, keeping the order of the
 * results. The API starts refusing requests under sustained parallel load, so
 * fan-out stays narrow.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * For a source the page can live without: any failure — including a key that
 * lacks permission for just this endpoint — becomes `null`, so one missing
 * permission does not send the reader back to the key gate. Cancellation
 * still propagates.
 */
export async function optional<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return null
  }
}
