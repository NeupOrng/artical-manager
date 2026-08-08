import { defineEventHandler, proxyRequest, createError, getRequestURL } from 'h3'
import { sanitisedProxyHeaders } from '../../utils/proxy-headers'

/**
 * The single proxy to the core-engine admin API.
 *
 * Everything the browser calls goes through here, which buys two things: the API
 * hostname never appears in client code, and every request is same-origin so
 * there is no CORS to configure and no cross-site cookie.
 *
 * It is NOT a security boundary. Oathkeeper validates the session and NestJS
 * resolves the principal; both would still be correct if this file did nothing.
 * Nobody should conclude the backend checks are redundant because this exists.
 * See backoffice/CLAUDE.md.
 *
 * Two rules govern this file:
 *
 *   1. Strip inbound identity headers before anything else. Handled by
 *      sanitisedProxyHeaders — see the note there on why it is load-bearing.
 *
 *   2. The upstream base URL comes from the environment and NEVER from request
 *      input. Taking any part of it from the path, a query param, or a header is
 *      the classic open-proxy/SSRF mistake: an attacker supplies an internal
 *      address and this server — which can reach Kratos' admin API, MinIO, and
 *      Postgres — fetches it for them and returns the body.
 */

/** Fixed prefix. Not derived from the request, so no route can reach elsewhere. */
const ADMIN_PREFIX = '/admin/v1'

export default defineEventHandler(async (event) => {
  const { apiBaseUrl } = useRuntimeConfig(event)

  if (!apiBaseUrl) {
    // Fail loudly at the first request rather than proxying to `undefined/...`,
    // which surfaces as a confusing parse error deep in the fetch layer.
    throw createError({
      statusCode: 500,
      statusMessage: 'NUXT_API_BASE_URL is not configured.',
    })
  }

  const segments = event.context.params?.path ?? ''

  // Reject traversal outright instead of normalising it. Normalising invites a
  // decode-order bug — `..%2f` and `%2e%2e/` both survive a naive check — and
  // there is no legitimate admin route containing a `..` segment, so refusing is
  // free.
  if (segments.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path.' })
  }

  // Only the path and query are taken from the request. The origin is fixed.
  const search = getRequestURL(event).search
  const target = `${apiBaseUrl.replace(/\/$/, '')}${ADMIN_PREFIX}/${segments}${search}`

  return proxyRequest(event, target, {
    headers: sanitisedProxyHeaders(event),
    // Cookies are forwarded (they are in the sanitised headers) because the
    // session cookie is what Oathkeeper validates downstream. That is the only
    // credential this app ever handles, and it handles it by passing it along
    // without reading it.
    fetchOptions: { redirect: 'manual' },
  })
})
