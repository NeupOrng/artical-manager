# Proposal — Authors management, with a Keto-ready permission layer

| | |
|---|---|
| Status | **Approved direction, not built.** Decided with the user 2026-09-14 (§2). One question open (§2.3). |
| Owner | Implemented by Claude (Opus 5), reviewed by the user |
| Touches | `core-engine/` (schema, `libs/author`, `apps/api` guards + new authors module, public article/author reads), `backoffice/` (`/authors`), `Taskfile.yml`, possibly both `websites/*` (§2.3), `infrastructure/env` |
| Replaces | The "Not built yet" `GET/POST /admin/v1/authors` lines in `api-reference.md` |

---

## 0. How to use this document (implementer, read first)

1. Read before touching anything: root `CLAUDE.md` (§5 auth model especially),
   `core-engine/CLAUDE.md`, `core-engine/docs/{auth-request-flow,tenant-isolation,api-conventions,api-reference,database-and-migrations}.md`,
   `backoffice/CLAUDE.md`, `infrastructure/ory/kratos/README.md`,
   `infrastructure/ory/keto/README.md`. Follow the `fullstack-feature` skill; use
   `change-db-schema`, `add-api-endpoint`, `tenant-isolation-audit` and
   `frontend-design` for their parts.
2. §2.1 and §2.2 are **decided — do not re-ask.** §2.3 is open: ask it once
   before Slice 8, with the default stated.
3. **Verify §10 against Kratos v1.3.1** before writing the identity adapter, the
   way the Umami facts were probed. Record the answers in
   `core-engine/docs/author-management.md` (new, §9).
4. Build in slice order (§6). `task check` green after every slice;
   `task test:integration` after slices touching the API.
5. No commits or pushes unless the user asks. Never type a real password into a
   form; never print or commit secrets.
6. When done: status → Built, add a build log (§11) of where the build deviated,
   and make the docs in §9 the reference.

---

## 1. Goal and scope

`/authors` is in the nav for site admins and is an empty page. Today:

- **There is no way to add an author** except the dev seed. Sign-up is disabled
  by design (root `CLAUDE.md` §5), so a new person cannot get in at all.
- **There is no way to remove one.** `authors` has no active flag; the guard
  checks deactivation only for platform admins; the row cannot be deleted because
  articles reference it. Cutting off someone who left means deleting their Kratos
  identity by hand. This is the most important gap this work closes.
- Roles are checked by `@Roles(minimum)` (14 endpoints) — fine, but it ties every
  endpoint to the role ladder, which is exactly what has to change the day Keto
  becomes the authority.

Deliver:

1. The **Authors page** for site admins: list with status and activity, invite,
   edit name / email / role, deactivate, reactivate, reissue an invite link.
2. **Real deactivation**: blocks Kratos login, ends sessions, and the API refuses
   the account on its next request.
3. A **permission layer**: every protected action names a permission
   (`authors.invite`, `articles.publish`, …) checked through one port, answered
   today from `authors.role`. Switching to Keto later replaces one adapter.
4. **Public hiding** of deactivated authors (profile page 404, bylines unlinked).
5. A **CLI task** to create a new site's first admin.

### Non-goals

- "My profile" (an author editing their own quote, contact opt-in, avatar) —
  **deferred by decision** (§2.1). The admin cannot edit those fields either; they
  are the author's own, and the contact opt-in is consent.
- Keto as the authority (§2.1 — the layer is built so it can be, later).
- Platform-admin management of authors (§2.1 — site admins only).
- Hard-deleting authors. Never: articles, bylines and history reference them.
- Changing usernames (§2.1 — locked).
- Email delivery of invites (§2.1 — link to copy).

---

## 2. Decisions

### 2.1 Decided by the user, 2026-09-14

| # | Question | Decision |
|---|---|---|
| A1 | What permission checks are built on | **A named-permission layer, Keto-ready.** Every action has a permission checked through a `PermissionChecker` port. The implementation reads `authors.role` — still ONE source of truth for roles. Keto replaces the adapter later; endpoints do not change. |
| A2 | How an invited author gets in | **A one-time sign-up link shown to the admin to copy.** No email infrastructure; nobody ever handles a password. |
| A3 | Who manages authors | **Site admins only**, for their own site. A new site's first admin is created with a **CLI task**. The platform admin does not manage authors. |
| A4 | Username changes | **Locked** after creation (login identifier and public `/author/:username`). |
| A5 | Deactivated author's public presence | **Hidden**: their `/author/:username` page 404s and bylines render as plain text (no link, no end-of-article card). Articles stay published under their name. |
| A6 | "My profile" page | **Deferred** — not in this round. |

### 2.2 Decided by the design (from the codebase; not user questions)

| # | Decision | Why |
|---|---|---|
| B1 | Deactivation is `authors.deactivated_at` **and** Kratos identity `state: inactive` **and** session revocation | Three layers: the API refuses at once (per-request resolution), login is refused, open sessions end. Any one alone leaves a hole. |
| B2 | "Invited" vs "Active" derives from `authors.last_seen_at` (set by the guard, throttled to once an hour) | Knowing whether a password was set would otherwise mean one Kratos call per list row. It also gives "last active". |
| B3 | Domain rules: **cannot remove the last active admin** of a site (demote or deactivate) → 409; **cannot deactivate yourself** → 409 | Prevents a site locking itself out. These are business rules (domain), not permissions. |
| B4 | The API reaches **Kratos' admin API internally** (`kratos:4434`), never through Kong | Anything that can reach it can create identities. The API gains that power only behind `authors.*` permissions. |
| B5 | Email and username conflicts are reported even when the other party is another site | Kratos enforces both **installation-wide** (unique indexes on credential identifiers and on recovery/verifiable addresses, verified 2026-09-14). Usernames are already public; an email conflict leaks only "this address has an account somewhere". Accepted and documented. |
| B6 | The permission layer replaces `@Roles` everywhere in the same change (Slice 7) | Two authorization mechanisms side by side is the drift the Keto README warns about. The mapping is 1:1 and mechanical. |

### 2.3 Open — ask once before Slice 8

**Cached article pages and a deactivated author.** Neither site has the
`POST /api/revalidate` route `websites/CLAUDE.md` specifies, and article pages are
`isr: true` — cached until revalidated, i.e. forever today. After deactivation the
author page 404s within ~5 min (`/author/**` is `isr: 300`), but every cached
article page keeps their author card and a link to the dead page.

**Revised 2026-09-28, after the project audit:** this is not only an Authors
problem. With no revalidation, **an edit to an already-published article may never
reach readers either** — the cached page is only rebuilt on a redeploy. So the
missing revalidation is a publishing defect that exists today, independent of this
work.

| Option | Effect |
|---|---|
| **(a) Recommended — revalidation as its own small change, FIRST**, then this plan's Slice 8 simply calls it | Fixes the publishing defect for everyone; A5 then works fully. Scope: `POST /api/revalidate` in both sites (secret header, idempotent), an API-side client, per-site secret + base URL in config, and calls on publish/unpublish as well as deactivate/reactivate. Worth its own proposal. |
| (b) Build revalidation inside this work, Slice 8 only | Authors ships complete, but the publish path stays unfixed until someone wires the same client to publishing. |
| (c) Accept staleness for now | A5 holds for the author page only; cached article pages keep a deactivated author's card until redeployed. Authors ships sooner; the publishing defect stays. |

---

## 3. Architecture

### 3.1 Permission layer

```
controller  @RequirePermission('authors.deactivate')
   │
PermissionGuard ──► PERMISSION_CHECKER port (libs/author/application/permissions.ts)
                      │
                      ├─ RoleBackedPermissionChecker   ← today: domain table over authors.role
                      └─ KetoPermissionChecker         ← later: one adapter, same port
```

- **Catalogue** (`libs/author/src/domain/permissions.ts`, pure): the union type
  `Permission` and `ROLE_PERMISSIONS: Record<AuthorRole, readonly Permission[]>`.
  Derive the article / category / media / dashboard entries **from the current
  `@Roles` annotations in the code**, 1:1 — not from this document. New:

  | Permission | contributor | editor | admin |
  |---|---|---|---|
  | `authors.read` | | | ✓ |
  | `authors.invite` | | | ✓ |
  | `authors.update` | | | ✓ |
  | `authors.deactivate` | | | ✓ |

- **Port**: `can(principal: { authorId, tenantId, role }, permission, resource: { tenantId }): Promise<boolean>`.
  Async on purpose — the Keto adapter is a network call. `resource.tenantId` is
  always the principal's today; it is in the signature so a relational model has
  somewhere to go.
- **Guard**: principal must be an author (platform admin → 403, as today); then
  `can()`; refusal → 403 `FORBIDDEN` with `details.permission`. Tenant scoping
  stays in repositories — a foreign id is still a **404**, never a 403.
- **`GET /admin/v1/me`** gains `permissions: Permission[]` (empty for platform
  admins). The backoffice hides controls by permission, never by comparing role
  names — so the Keto switch does not touch the UI either.
- **Keto mapping, for the day it switches** (write nothing now — the Keto README
  forbids a model nothing evaluates): `Tenant:<tenantId>#admins|editors|contributors@<authorId>`,
  permissions as computed relations in an OPL model. The switch also moves roles
  *out* of `authors.role` into tuples — never both.

### 3.2 Identity port (Kratos)

`libs/author/src/application/identity-ports.ts` → `IDENTITY_PROVIDER`:

```ts
createIdentity(input: { username, email, name }): Promise<{ identityId }>   // no credentials
findByUsername(username): Promise<{ identityId, email } | null>              // adoption path
updateTraits(identityId, traits: { username, email, name }): Promise<void>
setActive(identityId, active: boolean): Promise<void>                        // Kratos `state`
revokeSessions(identityId): Promise<void>
issueRecoveryLink(identityId, ttl: '72h'): Promise<{ link, expiresAt }>
```

Adapter: `libs/author/src/infrastructure/kratos-identity.provider.ts` — the only
file that knows it is Kratos. Typed errors: `IdentityConflictError` (which field),
`IdentityUnavailableError`. 3 s timeouts. Contract test against the pinned Kratos.

### 3.3 Invite flow

```
admin ── POST /admin/v1/authors {username, name, email, role} ──► API
  1. domain: normalise + validate username (existing rule), email, role
  2. repo: username free in this tenant?            → 409 USERNAME_TAKEN
  3. identity.createIdentity (no password)
       409 on username → findByUsername: an ORPHAN (no authors row anywhere,
         same email) is adopted — a previous invite died after step 3; else
                                                    → 409 USERNAME_TAKEN
       409 on email                                 → 409 EMAIL_IN_USE
  4. repo.create(author row, tenant from the principal, never the body)
  5. identity.issueRecoveryLink(72h)
◄── 201 { author, invite: { link, expiresAt } }   link shown ONCE, never stored
```

The link opens the backoffice's own recovery → settings pages (already built),
where the author sets their password. Their first authenticated request sets
`last_seen_at` → status Active.

### 3.4 Deactivate / reactivate

Deactivate: domain rules (not self, not last active admin) → **DB first**
(`deactivated_at = now()` — the API refuses from the next request) → Kratos
`state: inactive` → revoke sessions → [§2.3 (a): revalidate their pages]. If a
Kratos step fails: the DB flag stays (safe side), respond **503
IDENTITY_UNAVAILABLE**, and a retry is idempotent. Reactivate reverses (sessions
are not restored — they sign in again).

---

## 4. Inventory — exists, needs a small enhancement

| Area | Exists | Enhancement | Slice |
|---|---|---|---|
| Schema | `authors` (username, name, email, role, contact fields, avatar) | + `deactivated_at`, `last_seen_at` (nullable, additive) | 1 |
| Domain | `libs/author/domain/author.ts`: `isValidUsername`, `normaliseUsername`, `toPublicProfile`, `AuthorRole` | + `permissions.ts`; + role/deactivation rules (last admin, self) | 2, 4 |
| Repository | `AuthorRepository`: `findByUsername`, `findById`, `findByKratosIdentityId` | + `listForAdmin` (with article counts + status), `create`, `update`, `setDeactivated`, `touchLastSeen`, `countActiveAdmins`, `existsWithIdentity` | 4 |
| Guard | `PrincipalGuard` resolves authors, checks platform-admin deactivation | + refuse deactivated authors (403 `ACCOUNT_DEACTIVATED`); + throttled, non-awaited `last_seen_at` touch | 6 |
| Guard | `RoleGuard` + `@Roles(minimum)` on 14 endpoints | → `PermissionGuard` + `@RequirePermission(...)`; `RoleGuard`/`@Roles` removed at the end of Slice 7 | 2, 7 |
| API | `GET /admin/v1/me` | + `permissions` | 2 |
| Public | `GET /public/v1/authors/:username`; article reads select `authors.username` | deactivated → 404; `authorUsername` and `author` null for deactivated (bylines unlinked, no card) | 8 |
| Seed | `seed/authors.ts` creates Kratos identities with the admin API | Reference for the adapter's request shapes | 3 |
| Backoffice | nav entry `/authors` (minimum `admin`); empty `pages/authors/`; `useMe` | nav by permission; the page; `can()` helper | 10 |
| Kratos | recovery `use: link`, courier to mail catcher, backoffice recovery/settings pages | Used as-is for the invite link | 3 |
| Keto | Running, namespaces `Tenant`/`Article`/`Platform` declared | **No change** (A1) | — |

## 5. Inventory — new

| # | New | Where |
|---|---|---|
| N1 | Migration: `authors.deactivated_at`, `authors.last_seen_at` | `libs/database` |
| N2 | Permission catalogue + `PermissionChecker` port + `RoleBackedPermissionChecker` | `libs/author` |
| N3 | `@RequirePermission` + `PermissionGuard` | `apps/api/src/common` |
| N4 | Identity port + Kratos adapter + contract test | `libs/author`, `test/integration` |
| N5 | Use cases: `inviteAuthor`, `updateAuthor`, `reissueInvite`, `deactivateAuthor`, `reactivateAuthor` | `libs/author/application` |
| N6 | Authors admin module (controller, DTOs, Swagger) | `apps/api/src/modules/authors` |
| N7 | CLI `task authors:invite` (first admin of a site) | `libs/database/src/seed/invite-author.ts` or `scripts/`, `Taskfile.yml` |
| N8 | Backoffice `/authors` page, invite panel, edit panel, deactivate dialog | `backoffice/app` |
| N9 | [§2.3 (a)] Revalidation route in both sites + API revalidation client | `websites/*/server/api/revalidate.post.ts`, `libs/…` |
| N10 | `core-engine/docs/author-management.md` | docs |

---

## 6. Work breakdown — slices in build order

### Slice 1 — Schema

`authors.deactivated_at timestamptz NULL`, `authors.last_seen_at timestamptz NULL`.
Additive and nullable — the one-step path is correct. Generate, **read the SQL**,
migrate, `\d authors`. Map both onto the `Author` domain type
(`deactivatedAt`, `lastSeenAt`) — never onto public DTOs.

**Accept:** migration applied; existing rows untouched; types updated.

### Slice 2 — Permission layer

- `domain/permissions.ts`: catalogue + role table; unit tests (each role's set;
  ranks nest — every contributor permission is an editor's, every editor's an
  admin's; the table covers every permission).
- `application/permissions.ts`: port + token.
- `RoleBackedPermissionChecker` (pure table lookup — no I/O, but async signature).
- `@RequirePermission(p)` + `PermissionGuard` (reads principal from
  `PrincipalGuard`, throws 403 with `details.permission`).
- `GET /admin/v1/me` → `permissions`.

**Accept:** unit tests green; `/me` returns the admin set for mara, the
contributor set for nina, `[]` for the platform admin.

### Slice 3 — Identity port + Kratos adapter

Verify §10 first. Implement §3.2. Env: `KRATOS_ADMIN_URL` (default
`http://kratos:4434` in the api service; add to `env.ts`, **required** — the API
cannot provision without it, unlike analytics). Contract test in
`test/integration`: create → find → update traits → set inactive (login refused)
→ revoke → recovery link returns a URL → cleanup (delete the identity).

**Accept:** contract test green against the running Kratos.

### Slice 4 — Domain rules + repository

- Domain (`author.ts`): `assertCanChangeRole({ actorId, target, newRole, activeAdmins })`,
  `assertCanDeactivate(...)` → typed errors `LastAdminError` (409 `AUTHOR_LAST_ADMIN`),
  `SelfDeactivationError` (409 `AUTHOR_SELF_DEACTIVATION`). Unit tests.
- Repository methods from §4, tenant-first. `listForAdmin` returns per author:
  profile fields, role, `status` (`active` | `invited` | `deactivated`),
  `lastSeenAt`, `publishedCount`, `draftCount` (grouped counts merged in memory —
  see the tenant stats repository for why not joins). Tenant-isolation spec for
  every new method.

### Slice 5 — Use cases

Per §3.3 / §3.4, against in-memory fakes of both ports. Cases: happy invite;
username taken in this tenant; username taken elsewhere; orphan adoption; email in
use; DB failure after identity creation (retry adopts); reissue only while
`invited`; update (email change updates Kratos traits; role change runs the
last-admin rule); deactivate order (DB first) and Kratos-failure path; reactivate.

### Slice 6 — Guard: deactivation + last seen

`PrincipalGuard`: a deactivated author → 403 `ACCOUNT_DEACTIVATED` (distinct
message, so the backoffice error page can say "your account was deactivated"
rather than "not provisioned"). `last_seen_at`: `UPDATE … WHERE id = $1 AND
(last_seen_at IS NULL OR last_seen_at < now() - interval '1 hour')`, not awaited,
errors logged.

### Slice 7 — Endpoints + migrate `@Roles`

```
GET    /admin/v1/authors                       authors.read       ?status=&role=&search=
GET    /admin/v1/authors/:id                   authors.read
POST   /admin/v1/authors                       authors.invite     → 201 { author, invite: { link, expiresAt } }
PATCH  /admin/v1/authors/:id                   authors.update     { name?, email?, role? }  (username: 400 — forbidNonWhitelisted)
POST   /admin/v1/authors/:id/invite-link       authors.invite     → { link, expiresAt }; 409 unless invited
POST   /admin/v1/authors/:id/deactivate        authors.deactivate
POST   /admin/v1/authors/:id/reactivate        authors.deactivate
```

Author admin shape:

```jsonc
{
  "id": "…", "username": "nina-sato", "name": "Nina Sato",
  "email": "nina@…",                 // contact + recovery address
  "role": "contributor",
  "status": "active",                // active | invited | deactivated
  "lastSeenAt": "2026-09-14T03:10:00Z" | null,
  "deactivatedAt": null,
  "contactPublic": false,            // shown read-only; the author's own choice (A6)
  "publishedCount": 3, "draftCount": 1
}
```

Then replace every `@Roles(x)` with the equivalent `@RequirePermission(...)`
(B6), delete `RoleGuard` and the decorator, and keep the existing role
integration tests passing unchanged — they are the proof the mapping is 1:1.
Bruno requests for every endpoint; `api-reference.md` + `api-conventions.md`.

**Error codes:** `AUTHOR_NOT_FOUND` 404 · `AUTHOR_USERNAME_INVALID` 422 ·
`AUTHOR_USERNAME_TAKEN` 409 · `AUTHOR_EMAIL_IN_USE` 409 · `AUTHOR_LAST_ADMIN` 409 ·
`AUTHOR_SELF_DEACTIVATION` 409 · `AUTHOR_ALREADY_ACTIVE` 409 (reissuing a link) ·
`AUTHOR_DEACTIVATED` 409 (editing one) · `IDENTITY_UNAVAILABLE` 503 ·
`FORBIDDEN` 403 (with `details.permission`) · `ACCOUNT_DEACTIVATED` 403.

### Slice 8 — Public hiding (A5) [+ §2.3]

Ask §2.3 first.

- `GET /public/v1/authors/:username`: deactivated → 404.
- Public article reads (`listPublished`, `findPublishedBySlug`): select
  `CASE WHEN authors.deactivated_at IS NULL THEN authors.username END` as
  `authorUsername`, and return `author: null` for a deactivated author. The sites
  already render a null username as an unlinked byline and omit the card.
- `authorUsername` filter on the author listing must not match a deactivated author.
- [(a)] `websites/*/server/api/revalidate.post.ts` per `websites/CLAUDE.md`
  (secret header `X-Revalidate-Secret`, 401 + log on mismatch, idempotent), and an
  API client that posts `/author/<username>` plus that author's `/article/<slug>`
  paths after deactivate/reactivate. Revalidation failure never fails the
  deactivation (it is already effective in the API).

### Slice 9 — CLI: a site's first admin

`task authors:invite -- --site <domain> --username … --name … --email … --role admin`
→ runs `inviteAuthor` with real adapters outside Nest (import `reflect-metadata`
first; construct the Drizzle repository and Kratos adapter directly) and prints
the link. Legitimately runs in production (bootstrap, like `db:seed:admin`); no
default credentials involved.

### Slice 10 — Backoffice

`frontend-design` skill; tokens only; SSR rules (`useRequestFetch`, `computed`
not `watch`).

- `useMe` exposes `permissions`; `useCan()` → `can('authors.invite')`. Nav entry
  shown by `authors.read`.
- `/authors`: table — avatar/initial, name + `@username` (mono), role pill, status
  pill (Invited in the `draft` token, Deactivated muted), published · drafts
  linking to `/articles?authorId=`, last active (relative, exact on hover). Filter
  by role and status; search. Deactivated authors in a separate section below.
- **Invite** panel: name, username (live format check; note that it cannot be
  changed later), email, role (default contributor). On success, a one-time link
  panel with a copy button: "Shown once. Send it to <name>; it expires <time>."
- **Edit** panel: name, email, role; username shown locked. Role change warns if
  it would remove admin access. Server errors land on their fields.
- **Deactivate** dialog states the consequences before confirming: cannot sign
  in; public page hidden; bylines unlinked; N published articles stay live.
  Reactivate: one click, confirmation note.
- Invited rows: "Copy a new invite link".
- Error page: a deactivated user sees "Your account has been deactivated" (403
  `ACCOUNT_DEACTIVATED`), not the not-provisioned message, and no redirect loop.

**Accept:** SSR render verified as mara (admin: page), and as nina and an editor
(403 page / tab hidden); typecheck clean; tablet width.

### Slice 11 — Tests

| Layer | Tests |
|---|---|
| Domain | permission table (coverage, nesting); last-admin and self rules; username rules unchanged |
| Application | every §5 use case case, over fakes |
| Repository | tenant isolation for each new method; counts; status derivation |
| Adapter | Kratos contract test (Slice 3) |
| Integration (gateway) | invite → the link works through the real recovery + settings flow → the new author can call `/me` (drive it like `helpers/session.ts` does login); editor and contributor 403 on every authors endpoint; cross-tenant id 404; username taken 409; email in use 409; username in PATCH 400; last admin 409 (demote and deactivate); self-deactivate 409; deactivate → that author's next API call 403 AND Kratos login refused; reactivate → can sign in again; public author page 404 and bylines unlinked while deactivated; `/me` permissions per role; **all existing role tests still pass after the `@Roles` migration** |

Clean up every identity and row a test creates (Kratos admin API + SQL), as the
categories suite does.

### Slice 12 — Docs

§9.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The API can now create identities | Behind `authors.invite` only; Kratos admin API internal-only; every invite logged with actor and target ids (no email in logs) |
| Invite link leaks (chat, screenshot) | 72 h expiry; single use by Kratos; admin can reissue (old link stays valid until expiry — document; revoking needs a new identity) |
| Partial failures between Kratos and our DB | Orphan adoption on invite; DB-first on deactivate with idempotent retry; contract + use-case tests for each path |
| Locking a site out | Last-admin and self rules in the domain; CLI bootstrap as the recovery path |
| `@Roles` migration changes behaviour | 1:1 mapping from the code; existing role integration tests unchanged and green |
| Cross-site existence leak via "email in use" | Documented (B5); message says "already has an account", not which site |
| Cached pages show a deactivated author | §2.3 |

## 8. Out of scope, recorded

"My profile" (A6), Keto as authority (A1), platform-admin author management (A3),
email invites (A2), username changes (A4), author deletion, moving articles to
another author, login/last-seen history beyond `last_seen_at`.

## 9. Documentation updates (same change)

| File | Update |
|---|---|
| `core-engine/docs/author-management.md` (new) | Invite/deactivate flows, the three-layer deactivation, identity port, verified Kratos facts, CLI bootstrap, error codes |
| `core-engine/docs/auth-request-flow.md` | Deactivated authors (403 `ACCOUNT_DEACTIVATED`), `last_seen_at`, `PermissionGuard` replaces `RoleGuard` |
| `core-engine/docs/api-reference.md` / `api-conventions.md` | Authors endpoints and shapes; `/me.permissions`; remove "Not built yet" entries |
| `core-engine/CLAUDE.md` | Permission layer and identity port in `libs/author`; doc table row |
| `infrastructure/ory/keto/README.md` | The permission port is the seam; what the switch involves (§3.1) |
| `infrastructure/ory/kratos/README.md` | Invites via admin recovery links; identity `state` for deactivation |
| `infrastructure/CLAUDE.md` / `.env.example` | `KRATOS_ADMIN_URL` on the api service; [§2.3 (a)] revalidation secrets |
| `backoffice/CLAUDE.md` | Authors page; UI hides by permission, never by role name |
| `websites/CLAUDE.md` | Deactivated authors; [§2.3 (a)] revalidation now built |
| Root `CLAUDE.md` | §5: `RoleGuard` → permission layer over `authors.role`; §9 entry → built |
| `README.md` | `task authors:invite`; how to invite someone locally |

## 10. Verify against Kratos v1.3.1 before writing the adapter

1. `POST /admin/identities` **without** `credentials` creates a password-less
   identity; response shape; the 409 body for a taken username vs a taken email
   (the adapter maps them to different errors — find the distinguishing field).
2. `GET /admin/identities?credentials_identifier=<username>` finds a
   password-less identity (it has no password credential — may not match; if
   not, find by listing and filtering traits, or store the identity id sooner).
3. Setting `state: inactive` (`PATCH /admin/identities/{id}` JSON Patch, or `PUT`)
   and that login is then refused.
4. `DELETE /admin/identities/{id}/sessions` ends existing sessions.
5. `POST /admin/recovery/link { identity_id, expires_in }` — exists (probed
   2026-09-14: 400 on a missing id); `expires_in` format and response fields.
6. The link lands in the backoffice recovery page and continues into the
   settings flow where a password can be set (`privileged_session_max_age: 15m`).
7. `PUT /admin/identities/{id}` with new traits updates the recovery/verifiable
   address, and what happens to its verification status.

Confirmed already (2026-09-14): identities carry `state`; email is a recovery and
verification address; username identifiers and recovery/verifiable addresses are
unique **installation-wide** (Postgres unique indexes in the `kratos` database).
