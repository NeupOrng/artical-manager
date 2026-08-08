---
name: add-api-endpoint
description: Add or change an endpoint on the core-engine NestJS API, covering the public/admin surface split, tenant-scoped DTOs, state-transition verbs, error-code mapping, Swagger, and the matching Bruno request in /api. Use this whenever the user asks to add, expose, change, or remove an API route, endpoint, controller action, or "make X available to the admin/site" — including vague phrasings like "the editor needs to fetch categories" or "let the site list published articles". Also use it when reviewing an endpoint someone else wrote, since the public/admin separation is easy to violate invisibly.
---

# Adding an API endpoint

Read `core-engine/docs/api-conventions.md` first. It defines the route shapes,
response envelope, and status-code table; this skill covers the sequence and the
steps people skip.

## The decision that comes before any code

**Which surface does this belong to?**

| | `/public/v1/*` | `/admin/v1/*` |
|---|---|---|
| Auth | none | Oathkeeper-validated session |
| Returns | `status = published` only | any status |
| Caller | tenant websites | the backoffice |

These are separate controllers with separate DTOs, and that separation is the
enforcement mechanism. Not a conditional inside one handler, not a shared
serializer with a field omitted.

The failure being designed out is mundane and likely: someone adds a field to a
shared response type, and unpublished articles start leaking from a public
endpoint. With separate modules that mistake isn't reachable, which is worth more
than the small duplication it costs.

If an endpoint seems to need both — e.g. preview, which returns any status
publicly — it needs a token, not a shared controller. Preview is gated by a
short-lived signed token precisely so it can stay on the public surface without
weakening the rule.

## Sequence

**1. State transitions get verbs, not `PATCH { status }`.**

```
POST /admin/v1/articles/:id/schedule     { scheduled_at }
POST /admin/v1/articles/:id/publish
```

A generic `PATCH` that accepts `status` becomes a way to bypass the aggregate's
guards. Verbs keep each transition's preconditions and side effects explicit and
reviewable. See `core-engine/docs/article-status-lifecycle.md` for which
transitions are legal — `published → scheduled` deliberately isn't.

**2. Write the DTO.**

class-validator, and the global pipe runs with `whitelist` and
`forbidNonWhitelisted`, so unknown fields are rejected rather than silently
dropped. That's intentional: a client sending `tenantId` should get an error, not
have it quietly ignored.

Never accept `tenant_id` from the client in any form — body, query, path, or
header. The only legitimate source is the resolved `Author`.

**3. Keep the controller thin.**

Controllers translate HTTP to a use case and back. If you're writing an `if` about
business state in a controller, that check belongs in the domain layer, where the
worker also benefits from it.

**4. Map errors.**

Domain code throws typed errors from `libs/shared/src/errors`; one exception
filter maps them to HTTP. Controllers don't throw `HttpException`. Adding a domain
error without adding its mapping is an incomplete change — the client gets a 500
for something that should be a 422.

Two status choices that look wrong but aren't:
- **404, not 403, for cross-tenant access.** A 403 confirms the resource exists,
  which leaks across the isolation boundary.
- **422 for invariant violations** (missing cover image), **409 for illegal
  transitions** (scheduling something already published).

**5. Document and add the Bruno request.**

Swagger decorators on the endpoint, *and* a matching `.bru` request under `/api`
in the mirroring folder (`api/admin/...` or `api/public/...`).

The Bruno step is the one that gets skipped, and it's the one that matters most to
everyone else — the admin and site work read `/api` before they read your
controller. Treat "route added, collection not updated" as unfinished.

For anything touching auth or visibility, add the negative case too: tenant B's
key fetching tenant A's slug should 404. Those requests are cheap to keep and are
how the invariants get re-checked after unrelated changes.

## Verify

```bash
task check
task up          # if not already running
task health
```

Then exercise the actual route — `curl` it, or run the Bruno request. A passing
typecheck says the code compiles, not that the endpoint returns what you think.
For a public endpoint specifically, confirm a draft article is *not* reachable
through it before considering the change done.
