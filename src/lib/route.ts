import { useEffect, useState } from 'react'

/**
 * Which page is showing, kept in the URL hash (`#/finance`) so the browser's
 * back button and a copied link both work, with no server rule needed.
 */
export type Route = 'overview' | 'inventory' | 'accountability' | 'finance' | 'security' | 'compliance' | 'incidents' | 'vendors' | 'shadow'

const ROUTES: readonly Route[] = ['overview', 'inventory', 'accountability', 'finance', 'security', 'compliance', 'incidents', 'vendors', 'shadow']

const read = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(r) ? r : 'overview'
}

export const href = (r: Route): string => (r === 'overview' ? '#/' : `#/${r}`)

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
