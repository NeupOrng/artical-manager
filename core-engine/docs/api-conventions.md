# API conventions

Read this before adding or changing any endpoint. Keep `/api` (Bruno) updated in the
same change.

**Shapes live in `api-reference.md`**, not here — this file is the rules
(envelope, errors, status codes, the public/admin split), that one is the actual
request and response bodies. The frontends hand-write their types from it, so it
must be updated in the same change as the endpoint.

## Two surfaces, hard separated

| | `/public/v1/*` | `/admin/v1/*` |
|---|---|---|
| Auth | none | Oathkeeper-validated session |
| Callers | tenant websites | the backoffice |
| Returns | `status = published` only | any status |
| Rate limit | Kong, per tenant API key | Kong, generous |
| Cacheable | yes (`Cache-Control`, Kong `proxy-cache`) | no |

**These are separate controllers with separate DTOs.** Do not share a response
serializer between them, and do not gate visibility with a conditional inside one
handler. The failure mode being designed out is: someone adds a field to a shared
DTO, and unpublished articles start leaking from a public endpoint. Different
modules means that mistake isn't reachable.

Public handlers query through a repository method that filters
`status = 'published'` at the SQL level — not in application code, and not by
filtering an already-fetched list.

## Tenant resolution

- **Admin routes** — `tenant_id` comes from the `Author` resolved via
  `X-Kratos-Identity-Id`. Never from the request.
- **Public routes** — the caller presents `X-Tenant-Key`; Kong's `key-auth`
  plugin validates it and sets `X-Consumer-Custom-ID` to the tenant's UUID, which
  `TenantContextGuard` resolves. `hide_credentials` keeps the key from reaching
  NestJS at all. Never trust a `tenant` query param or the `Host` header (which
  at this point is Kong's).

## Routes

Marked `[BUILT]` below. Everything else is the agreed shape, not yet built.

Two admin routes return a **discriminated union on `kind`** rather than one shape
with optional fields, because a platform admin has no tenant and no role — `null`
there means "does not apply", not "unknown". Shapes in `api-reference.md`.

```
GET    /public/v1/articles                 list published, paginated   [BUILT]
GET    /public/v1/articles/:slug           one published article       [BUILT]
GET    /public/v1/categories               tenant taxonomy
GET    /public/v1/categories/:slug/articles
GET    /public/v1/preview/:id              signed token required, any status

GET    /admin/v1/me                         the current principal            [BUILT]
GET    /admin/v1/dashboard                  summary, shape per principal    [BUILT]
GET    /admin/v1/articles                   list, any status, filterable    [BUILT]
POST   /admin/v1/articles                   create a draft                  [BUILT]
GET    /admin/v1/articles/:id               with content                    [BUILT]
PATCH  /admin/v1/articles/:id               partial; never touches status   [BUILT]
DELETE /admin/v1/articles/:id               editor+                         [BUILT]
POST   /admin/v1/articles/:id/publish       goes live immediately, editor+  [BUILT]
POST   /admin/v1/articles/:id/unpublish     editor+                         [BUILT]
POST   /admin/v1/media/presign              → { uploadUrl, publicUrl, mediaId }  [BUILT]
POST   /admin/v1/media/:id/confirm          → records the row, queues nothing    [BUILT]
GET    /admin/v1/media                      library, paginated                   [BUILT]
GET    /admin/v1/media/:id                  poll for processing status           [BUILT]
DELETE /admin/v1/media/:id                  soft delete                          [BUILT]
GET    /admin/v1/categories  …
GET    /admin/v1/authors     …
GET    /health/live  /health/ready
```

State transitions are **verbs on sub-resources**, not `PATCH { status }`. This keeps
each transition's guards explicit and stops a generic PATCH from becoming a way to
bypass the aggregate.

**Admin routes are a separate Kong service from the public ones.** Kong attaches
plugins per service, so sharing one would apply the public `proxy-cache` to admin
responses — polling an upload's status would then return a cached `pending` for the
full TTL while the row is already `ready`.

## Requests

- Bodies are validated by class-validator DTOs with `whitelist: true` and
  `forbidNonWhitelisted: true`. Unknown fields are an error, not silently dropped.
- `PATCH` is partial; `PUT` is not used.
- Timestamps in and out are ISO 8601 UTC. Never a local-time string.

## Responses

Collections:

```json
{
  "data": [ … ],
  "meta": { "page": 1, "perPage": 20, "total": 137 }
}
```

Single resources return the object unwrapped. Pagination is `page` / `perPage`,
`perPage` capped at 100.

Errors — one shape, produced by the global exception filter:

```json
{
  "error": {
    "code": "ARTICLE_MISSING_COVER_IMAGE",
    "message": "Article cannot be scheduled without a cover image.",
    "details": { "articleId": "018f…" }
  }
}
```

`code` is a stable machine-readable string the admin UI can branch on. `message` is
for humans and may change. Domain error classes map to codes in one place; adding a
domain error without adding its mapping is an incomplete change.

## Status codes

| Code | Used for |
|---|---|
| 200 | successful read / mutation returning a body |
| 201 | resource created |
| 204 | successful delete |
| 400 | DTO validation failure |
| 401 | missing/invalid identity header (should be unreachable — the edge rejects first) |
| 403 | authenticated but wrong role, or cross-tenant attempt |
| 404 | not found **or** belongs to another tenant — never distinguish the two |
| 409 | invalid state transition, or confirming an upload that isn't in storage |
| 422 | domain invariant violated (e.g. missing excerpt) |

404-not-403 for cross-tenant access is deliberate: a 403 confirms the resource
exists, which leaks tenant data across the isolation boundary.

## Public author profiles

`GET /public/v1/authors/:username` returns an author's profile plus their
published articles. `GET /public/v1/articles/:slug` carries the same profile as
`author`, and the list surface carries `authorName` + `authorUsername`.

- **Usernames are unique per tenant, never globally.** The lookup is scoped like
  any other; a username-only query returns another tenant's author.
- **Usernames are normalised (trim + lowercase) before lookup**, so
  `/author/Jane` and `/author/jane` resolve to one page rather than one 404.
- **`email` and `telegram` are opt-in per author** via `contact_public`, which
  defaults to false. The redaction happens once, in the author domain
  (`toPublicProfile`), and the DTO serialises the already-redacted projection.
  Never add a raw contact field to a public DTO, and never gate it in a
  controller — that is how one caller ends up with a different answer.

### Withdrawing contact consent is NOT immediate

Learned the hard way while building this. Setting `contact_public = false` does
not remove a published address promptly, because two caches sit in front of it:

| Layer | Delay |
|---|---|
| Kong `proxy-cache` on public GETs | up to 60s (`cache_ttl`, kong.template.yml) |
| The site's ISR page | until revalidated — `/article/**` is `isr: true`, i.e. cached **indefinitely** until that article is republished |

So a contact address withdrawn today can remain readable on a cached article page
for an unbounded period. `/author/**` is deliberately `isr: 300` to bound it on
that route, but the end-of-article card is not covered by that.

If consent withdrawal ever needs to be prompt, the fix is to have the worker
revalidate every article by that author when the flag flips — the revalidation
contract in `websites/CLAUDE.md` already carries the mechanism. **Not built.**

This is also why the Kong cache makes the opt-in look broken during local
testing: flip the flag, re-request, and you get the previous body for 60s. Add a
cache-busting query parameter before concluding the code is wrong.

## Versioning

`v1` in the path. The public surface is consumed by deployed sites that may be
serving stale ISR pages, so breaking changes there need a `v2` alongside — do not
change `v1` response shapes in place.

## Related

- `auth-request-flow.md` — how identity arrives
- `tenant-isolation.md` — why 404 not 403
- `article-status-lifecycle.md` — what each transition endpoint may do
