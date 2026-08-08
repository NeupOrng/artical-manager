import type { H3Event } from 'h3'
import { getRequestHeaders } from 'h3'

/**
 * Headers a client must never be able to set on a proxied request.
 *
 * `x-kratos-identity-id` is the one that matters. NestJS trusts that header
 * absolutely — it is the entire authentication result. If a browser could send
 * it and have it survive to the API, that is full impersonation of any author in
 * any tenant, and the API has no way to tell the difference.
 *
 * Kong strips it too, and that is the real control (this app is ergonomics, not
 * a security boundary — backoffice/CLAUDE.md). This list is the second of two
 * independent strips, not the only one. Both exist because either one being
 * misconfigured is otherwise silent.
 *
 * The rest are here because they let a caller lie about provenance:
 *  - x-consumer-* is what Kong's key-auth sets to identify a tenant
 *  - x-forwarded-* / x-real-ip feed rate limiting and audit logs
 */
const FORBIDDEN_INBOUND = [
  'x-kratos-identity-id',
  'x-consumer-id',
  'x-consumer-custom-id',
  'x-consumer-username',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
]

/**
 * Hop-by-hop headers. Forwarding these corrupts the upstream connection rather
 * than being a security problem: a `content-length` copied onto a request whose
 * body the proxy re-encodes, or a `connection: keep-alive` passed through, both
 * produce failures that look like the upstream is broken.
 */
const HOP_BY_HOP = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
  'content-length',
]

/**
 * The inbound headers, with everything unsafe removed.
 *
 * Deny-list rather than allow-list, deliberately: an allow-list would silently
 * drop headers a future endpoint needs (conditional requests, content
 * negotiation, idempotency keys) and the resulting bugs are subtle. The things
 * that MUST be dropped are a short, well-understood set, and they are dropped
 * unconditionally.
 */
export function sanitisedProxyHeaders(event: H3Event): Record<string, string> {
  const incoming = getRequestHeaders(event)
  const out: Record<string, string> = {}

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue

    const name = key.toLowerCase()
    if (FORBIDDEN_INBOUND.includes(name)) continue
    if (HOP_BY_HOP.includes(name)) continue

    out[name] = value
  }

  return out
}
