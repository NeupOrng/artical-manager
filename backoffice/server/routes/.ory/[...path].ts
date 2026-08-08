import { defineEventHandler, proxyRequest, createError, getRequestURL } from 'h3'
import { sanitisedProxyHeaders } from '../../utils/proxy-headers'

/**
 * Proxies Kratos' PUBLIC self-service API under this app's own origin.
 *
 * WHY THIS FILE EXISTS AT ALL
 *
 * So the session cookie is first-party. The browser only ever talks to
 * `admin.example.com`, so Kratos' cookie is set by that origin and `SameSite=Lax`
 * is sufficient. Without this, the admin and Kratos are separate origins, the
 * cookie has to be `SameSite=None`, and browsers are actively restricting
 * exactly that. This is not a convenience — it is what keeps the login working
 * as third-party cookie policy tightens.
 *
 * Kratos must agree about the path: `serve.public.base_url` in kratos.yml is
 * `http://localhost:3001/.ory/`, which is what makes the `ui.action` URLs in a
 * self-service flow point back through here. Change one and you must change the
 * other, or flows render correctly and submit into the void.
 *
 * A `[...path]` route under `server/routes/` (not `server/api/`) because the
 * browser navigates to these URLs directly during a login redirect — an
 * `/api`-prefixed path would be wrong in every URL Kratos generates.
 *
 * THIS IS THE PUBLIC API ONLY. Kratos' admin API on :4434 creates identities and
 * can impersonate anyone. It is not proxied here and must never be — that is why
 * `kratosPublicUrl` is a separate config key rather than a base with a port
 * appended somewhere.
 */
export default defineEventHandler(async (event) => {
  const { kratosPublicUrl } = useRuntimeConfig(event)

  if (!kratosPublicUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_KRATOS_PUBLIC_URL is not configured.',
    })
  }

  const segments = event.context.params?.path ?? ''

  if (segments.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path.' })
  }

  const search = getRequestURL(event).search
  const target = `${kratosPublicUrl.replace(/\/$/, '')}/${segments}${search}`

  return proxyRequest(event, target, {
    headers: sanitisedProxyHeaders(event),
    fetchOptions: {
      // MANUAL, and this is the important bit. Kratos drives login by
      // responding 303 to a browser form post, and the response carries the
      // Set-Cookie that establishes the session. Following the redirect here
      // would consume it server-side: the browser would get the final page and
      // no cookie, and the user would be bounced back to the login form with no
      // error to explain why.
      redirect: 'manual',
    },
  })
})
