import type { Dashboard } from '~/types/api'

/**
 * The dashboard summary for whoever is logged in.
 *
 * One endpoint returns one of two shapes, chosen server-side from the resolved
 * principal — the client does not get to ask for the other. Narrow on `kind`.
 *
 * Not cached: counts are the reason to look at this screen, and a stale count is
 * a wrong count. It is one query per page load on a low-traffic admin.
 */
export function useDashboard() {
  // useRequestFetch so the session cookie survives SSR — see useMe().
  const requestFetch = useRequestFetch()

  return useAsyncData<Dashboard>('dashboard', () =>
    requestFetch<Dashboard>('/api/backend/dashboard'))
}
