/**
 * Records the browser's time zone so the dashboard cuts days where the VIEWER's
 * day begins, not the server's (decision D5).
 *
 * A cookie so the next server render already knows it; state so this session
 * switches immediately. Client-only by necessity: the server cannot know it.
 */
export default defineNuxtPlugin(() => {
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  catch {
    return
  }
  if (!zone) return

  const cookie = useCookie<string | null>('artical_tz', {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })
  if (cookie.value !== zone) cookie.value = zone

  const tz = useViewerTimeZone()
  if (tz.value !== zone) tz.value = zone
})
