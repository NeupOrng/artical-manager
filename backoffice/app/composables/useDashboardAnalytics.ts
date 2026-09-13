import type { AnalyticsRange, DashboardAnalytics } from '~/types/api'

const isTimeZone = (zone: unknown): zone is string => {
  if (typeof zone !== 'string' || !zone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  }
  catch {
    return false
  }
}

/**
 * The viewer's IANA time zone — where "a day" begins on the dashboard
 * (decision D5 in docs/proposals/dashboard-analytics-umami.md).
 *
 * Seeded from the `artical_tz` cookie so SSR renders in the viewer's zone; the
 * client plugin (plugins/viewer-timezone.client.ts) writes the browser's real
 * zone into both. A junk cookie falls back to UTC rather than a 400.
 */
export function useViewerTimeZone() {
  return useState<string>('viewer-tz', () => {
    const cookie = useCookie<string | null>('artical_tz').value
    return isTimeZone(cookie) ? cookie : 'UTC'
  })
}

/**
 * Readership + editorial analytics for the dashboard.
 *
 * `enabled` is false for platform admins, who have no tenant and would get a
 * 403 — they read `views30d` from the main dashboard instead.
 */
export function useDashboardAnalytics(range: Ref<AnalyticsRange>, enabled: Ref<boolean>) {
  const requestFetch = useRequestFetch()
  const tz = useViewerTimeZone()

  const result = useAsyncData<DashboardAnalytics | null>(
    'dashboard-analytics',
    () => enabled.value
      // useRequestFetch, not $fetch: the session cookie must survive SSR.
      ? requestFetch<DashboardAnalytics>('/api/backend/dashboard/analytics', {
          query: { range: range.value, tz: tz.value },
        })
      : Promise.resolve(null),
    { watch: [range, tz, enabled] },
  )

  // First visit: SSR had no cookie and rendered UTC days. Once the plugin has
  // put the real zone in state, fetch again in it — once.
  onMounted(() => {
    const data = result.data.value
    if (data && data.timezone !== tz.value) void result.refresh()
  })

  return result
}
