/**
 * Sends anyone without a usable session to the login page.
 *
 * COSMETIC, like all client-side auth. The API enforces access; this only avoids
 * rendering a shell that is about to fill with 401s. Nothing here may be treated
 * as a permission check — backoffice/CLAUDE.md.
 *
 * Global rather than per-page: the default for an admin tool should be "behind a
 * session", so a new page is protected by existing rather than by remembering to
 * opt in. The public routes are the short list below.
 */
/**
 * `/auth/settings` is deliberately NOT here — it needs a session, so it goes
 * through the check like any other page. `/auth/verification` is, because a
 * verification link arrives by email and may be opened in a browser that has no
 * session; bouncing it to login would lose the flow token in the URL.
 */
const PUBLIC_ROUTES = [
  '/auth/login',
  '/auth/recovery',
  '/auth/verification',
  '/auth/error',
]

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_ROUTES.some(route => to.path.startsWith(route))) return

  const requestFetch = useRequestFetch()

  try {
    // See useMe() for why this is useRequestFetch and not $fetch.
    await requestFetch('/api/backend/me')
  }
  catch (error) {
    const status = (error as { statusCode?: number }).statusCode

    // 403 is NOT the same as 401 and must not redirect to login. It means the
    // session is valid but the identity is not provisioned as an author or
    // platform admin — bouncing them to Kratos would log them straight back in
    // and return them here, forever. Show them what is actually wrong.
    if (status === 403) {
      return navigateTo('/auth/error?reason=not-provisioned')
    }

    if (status === 401) {
      return navigateTo('/auth/login')
    }

    // Anything else is the backend being down, not an auth problem. Saying
    // "please log in" would be a lie and would send them into a flow that also
    // cannot work.
    return navigateTo('/auth/error?reason=unavailable')
  }
})
