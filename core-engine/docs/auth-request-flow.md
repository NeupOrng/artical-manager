# Auth request flow

How a request becomes an authenticated, tenant-scoped operation. Read before
touching guards, decorators, or anything that reads a header.

## The chain

```
browser
  │  session cookie (first-party to admin.example.com)
  ▼
/admin  Nitro proxy  ─── strips inbound identity headers, forwards cookie
  │
  ▼
Kong    TLS, routing, rate limit, removes X-Kratos-Identity-Id from client input
  │
  ▼
Oathkeeper  cookie_session authenticator → Kratos /sessions/whoami
  │         header mutator → sets X-Kratos-Identity-Id
  ▼
NestJS  PrincipalGuard: identity → Author OR PlatformAdmin → Principal
```

Anything that fails validation is rejected before NestJS. By the time a request
reaches application code, the identity header is trustworthy.

## What NestJS does

Reads exactly one header:

```
X-Kratos-Identity-Id: 018f3c2a-…
```

`PrincipalGuard` (`apps/api/src/common/guards/principal.guard.ts`) resolves it and
attaches a `Principal` to the request. That principal is the **only** source of
`tenant_id`.

`Principal` is a **discriminated union**, not one shape with optional fields:

| kind | carries | |
|---|---|---|
| `author` | `authorId`, `tenantId`, `role`, `username`, `name` | tenant-scoped |
| `platform-admin` | `platformAdminId`, `username`, `name` | **no tenant, no role** |

The platform variant genuinely lacks a `tenantId` property, so
`principal.tenantId` does not typecheck until the code narrows on `kind`. With an
optional field instead, the unsafe call would compile and fail at runtime as
`eq(table.tenant_id, undefined)` — SQL matching nothing, which surfaces as an
**empty list**, not an error. That reads as "no articles yet" and survives review.

Resolution order is `authors` first, `platform_admins` second. No database
constraint can span two tables, so the order is fixed in code rather than left to
whichever query returns first.

Decorators:

- `@CurrentPrincipal()` — the union; narrow it yourself.
- `@CurrentAuthor()` — narrowed to `AuthorPrincipal`, 403s a platform admin. Use
  this for anything tenant-scoped, which is almost everything.

If the header is absent, return 401 — but treat it as an infrastructure alarm, not a
normal path. It means the edge is misconfigured or something is talking to the API
directly.

## Rules

- **Resolve the Author every request.** Do not cache `tenant_id` or `role` in a
  token, session, or long-lived cache. A deactivated author or a role change must
  take effect immediately. A short Redis cache (~30s) keyed by identity id is
  acceptable if the lookup shows up in profiling; anything longer is not.
- **Never accept `tenant_id` from the client** — not from body, query, path, or
  header. The only legitimate source is the resolved `Author`.
- **No authentication logic in NestJS.** No Passport, no JWT verification, no
  password hashing, no session store, no cookie parsing. Kratos owns credentials;
  Oathkeeper owns validation.
- **Roles are checked in NestJS**, not at the edge. Oathkeeper answers "who is
  this"; `RoleGuard` answers "may they do this". Roles are RANKED:
  `admin` > `editor` > `contributor`, so `@Roles('editor')` admits admins too.
  Ranked rather than a set, because listing every acceptable role at every
  endpoint means a role added later is missing from the ones you overlook — and
  those fail closed and silently.
- **A platform admin fails every tenant-role check**, and that is correct. They are
  not a fourth rung on the ladder; `@PlatformAdminOnly()` is a separate decorator.
  Admitting them "because they're the super admin" is the cross-tenant access
  root `CLAUDE.md` §1 rules out.
- **An unknown identity is 403, not auto-provisioned.** A valid Kratos session with
  no matching row means someone got an identity without being assigned to a
  tenant. Do not create the Author on the fly — that would silently grant access.
- **A 403 is not a 401, and the UI must not conflate them.** Redirecting an
  unprovisioned identity to the login page produces an infinite loop: they log in
  successfully every time and land back on the same 403.
- **Guards are opt-in per module, never `APP_GUARD`.** A global guard would put
  `PrincipalGuard` in front of `/public/v1/*` and `/health`, which must never see
  an identity header. Opt-in fails visibly when a route forgets it; global fails
  invisibly when a public route starts demanding auth in production only.

## Why the API cannot trust its network

The backend runs on one VPS, but `/admin` and `/websites/*` are on a managed host
and reach the API over the public internet. There is no private network to hide
behind. The identity header is trustworthy **only** because Oathkeeper set it and
Kong stripped any client-supplied copy — not because of where the request came from.

This is why the header-stripping rule is load-bearing rather than defensive. If a
client can send `X-Kratos-Identity-Id` and have it survive to NestJS, that is full
impersonation of any author in any tenant.

## Known non-goals

- `openid-connect` is a Kong **Enterprise** plugin and is not available. Do not
  write gateway config that assumes it.
- Hydra and Keto are **deployed and migrated but not in the request path** (revised
  2026-08-08). When a non-browser API client appears, the migration is: enable
  `oauth2_introspection` in `oathkeeper.yml` — it is already written there at
  `enabled: false` — and switch the `admin-api` rule's authenticator. NestJS does
  not change; it still reads one header. See
  `../../infrastructure/ory/{hydra,keto}/README.md`.

## Public routes

`/public/v1/*` has no Oathkeeper rule. Kong applies TLS, rate limiting, caching, and
tenant API key → consumer mapping. These handlers must never see or use
`X-Kratos-Identity-Id`.

## Related

- `tenant-isolation.md` — what happens after the context is resolved
- `api-conventions.md` — the public/admin split
- `../../infrastructure/CLAUDE.md` — the Kong and Oathkeeper config itself
