# CLAUDE.md — Project requirements & decisions

The authoritative statement of **what we are building and what has been decided**.
Scope, requirements, and cross-cutting rules live here. Implementation detail does
not — see the pointers at the bottom.

If a requirement isn't covered here, **ask rather than assume**. Most of the
architecture in this project was decided through explicit discussion, not defaults.

---

## 1. What this is

A multi-tenant, Medium-like content publishing platform. One backoffice manages
several independently-branded websites ("tenants"). Each tenant has:

- its own fully custom domain
- its own isolated pool of authors (strict isolation — no cross-tenant access)
- its own topical focus and category taxonomy
- its own dedicated Facebook Page (used manually in Phase 1)

Authors write in a rich WYSIWYG editor and publish immediately — there is no
scheduled auto-publish (see §2). When an article link is shared anywhere
(Facebook, Slack, …) it must render a proper title/description/image preview.

**Launch scope: 2 tenants — a technology site and a gaming site.** The data model
is multi-tenant from day one (every table carries `tenant_id`), so adding tenants
later is additive: a new row, a domain, a site project, and authors.

---

## 2. Explicitly NOT in scope (Phase 2 / deferred)

- **Automatic Facebook posting & commenting.** Phase 1 requires only correct Open
  Graph tags so a *manually* shared link looks right. The DB reserves
  `fb_page_id`, `fb_page_access_token`, `hook_text`, `fb_post_id`, `fb_comment_id`
  so enabling this later is additive.
- **Hydra in the login path, and Keto as the permission authority.** Revised
  2026-08-08: both services are now **deployed and migrated**, but neither is in
  the request path. The backoffice logs in with a first-party Kratos session;
  `RoleGuard` in NestJS reads `authors.role`. Enabling either is a config change,
  not a rebuild — see §5 and `infrastructure/ory/{hydra,keto}/README.md`.
- **Scheduled auto-publish.** Removed by decision: publishing is immediate, so
  there is no queue, no timer, and no future-dated article state. Re-adding it
  later is additive (a status value, a timestamp column, and a polled sweep).
- On-site native commenting (the tenant's Facebook Page comments are sufficient)
- Cross-posting to X / LinkedIn / Instagram
- Authors belonging to more than one tenant
- A dynamic, Strapi-style content-type builder — article structure is fixed; only
  categories differ per tenant

Do not build any of the above unless explicitly asked.

---

## 3. Repository layout

```
/CLAUDE.md          This file — requirements and decisions
/api                Bruno API collection (admin + public endpoints, environments)
/docs/proposals     Approved plans not yet built — history once built (see §10)
/core-engine        NestJS monorepo — apps/api, apps/worker, libs/ (backend only)
/backoffice         Nuxt backoffice UI (referred to as `/admin` in older notes)
/websites           One Nuxt SSR project per tenant public site
/infrastructure     Docker Compose, gateway/identity config, backups, monitoring
/.claude/skills     Project workflows for AI assistants (see §11)
/Taskfile.yml       Entry point for every common command — start here
```

Each top-level directory is an **independently deployed unit** with its own tooling
and its own `CLAUDE.md`. Read the one for the area you're touching **before**
changing anything in it.

`/backoffice` is deliberately *not* inside `/core-engine`: the latter is a NestJS
monorepo with one `package.json` and one `nest-cli.json`, built into a Docker image
for the VPS. The admin is a Nuxt app on a managed host. Different tooling, different
build, different deploy target.

---

## 4. Hosting model

This is a deliberate split and it drives several rules below.

| Component | Where | Why |
|---|---|---|
| `core-engine` (API, worker, Postgres, Redis, MinIO, Kratos, Kong, Umami) | **One VPS**, Docker Compose, offsite backups | Persistent processes; low traffic; no need for horizontal scale |
| `admin` | Managed host (Vercel-style) | Low traffic, ~10 authors |
| `websites/*` | Managed host (Vercel-style), ISR + edge cache | Read traffic is the only thing that scales on a content site |

Consequences that must hold in code:

- **The API is internet-facing. It cannot trust its network.** Never accept an
  identity header that has not been validated by the gateway layer.
- Frontends absorb read traffic via ISR. The backend should see low, mostly
  write-shaped traffic.
- With ISR + stale-while-revalidate, the public sites keep serving during a VPS
  outage. Backend downtime means "authors can't log in and publishes run late",
  not "the sites are down". Preserve that property.
- Managed hosts cap request body size (~4.5 MB on typical serverless functions).
  **Media uploads must go browser → MinIO via presigned URL**, never proxied
  through a frontend server route.

---

## 5. Auth model — read before touching anything auth-related

Phase 1 uses **Kratos for identity + Kong/Oathkeeper for enforcement at the edge.**

```
browser → /backoffice (Nuxt/Nitro proxy) → Kong → Oathkeeper → NestJS API
```

1. The author logs in through a Kratos self-service flow rendered by `/backoffice`.
   Kratos is proxied under the admin's own origin (`admin.example.com/.ory/*`) so
   the session cookie is first-party — no cross-domain or `SameSite=None` cookies.
2. `/backoffice`'s Nitro layer proxies API calls, forwarding the session cookie. This
   hides the API and avoids CORS. It is **ergonomics, not a security boundary.**
3. Kong terminates TLS, routes, rate limits. Oathkeeper's `cookie_session`
   authenticator validates the session against Kratos and injects
   `X-Kratos-Identity-Id`. Invalid sessions never reach NestJS.
4. NestJS reads that one header, resolves the `Author` record → `tenant_id` +
   `role`, and scopes every query by it.

### Hard rules

- **No Passport.js, no hand-rolled JWT verification, no password hashing in
  NestJS.** Kratos owns credentials. `Author` stores `kratos_identity_id`, never a
  password.
- **Kong's `openid-connect` plugin is Enterprise-only and is NOT available to us.**
  Do not write config that depends on it.
- **Strip inbound identity headers at the edge.** If a client can send
  `X-Kratos-Identity-Id` and have it survive to NestJS, that is a full
  impersonation hole. Kong must remove it before Oathkeeper sets it.
- **Never put `tenant_id` or `role` in a token or session claim.** Resolve from the
  `Author` row per request so role changes and deactivations take effect at once.
- **`email` is contact information, NOT a login identity** — decided 2026-08-07.
  Identity is `username`, chosen by the author at registration, unique per tenant
  and used as the public `/author/:username` segment. The username is a Kratos
  identity trait; `authors.email` stays a publishable contact address and must not
  be treated as a credential or a unique key. Email carries `recovery.via` and
  `verification.via` in the identity schema — those are *delivery channels*, not
  credentials, and must not drift into being one.
- **Usernames are globally unique in practice** — consequence, noted 2026-08-08.
  `authors_tenant_username_key` is `(tenant_id, username)`, but a Kratos password
  identifier has no tenant to be scoped by, and the login form cannot ask for one
  without breaking "tenancy is never chosen in the UI". So Kratos enforces a
  stricter rule than Postgres does. The per-tenant constraint stays because it is
  correct for the data. Escape hatch if this ever bites: per-tenant admin
  subdomains, each with its own Kratos — a deployment change, not a schema one.
  See `infrastructure/ory/kratos/README.md`.
- **Self-service registration is disabled.** Authors are provisioned by an admin.
  An identity with no matching row is a **403, never auto-provisioned** — creating
  the Author on the fly would silently grant access to whichever tenant was
  guessed. The first platform admin is created through the Kratos admin API by
  `task db:seed:admin`.
- Public tenant site routes are unauthenticated and hit a separate public read API.

Why Hydra and Keto run but are not used — revised 2026-08-08:

Hydra earns its place with third-party OAuth clients or several independent apps;
we have one admin. Using it for a browser login would mean building a
login-and-consent provider, and Kratos would still be doing the actual
authentication inside it. Keto earns its place when permissions become
*relational*; ours are a `tenant_id` match plus three ranked roles, which is a
comparison against a row already loaded. Making Keto authoritative today would add
a network hop to every request and create two sources of truth for one fact.

Both are deployed so the eventual switch is config rather than infrastructure.
`oauth2_introspection` is already written in `oathkeeper.yml` at
`enabled: false`. **NestJS does not change either way** — it reads one header and
resolves the principal from the database. Protect that property.

### Platform admins — decided 2026-08-08

The operator who creates tenants is **not** an `Author`. `platform_admins` is a
separate table, and a platform principal carries **no `tenant_id` and no `role`**.

The alternative — a `super_admin` role with a nullable `authors.tenant_id` — was
rejected because that column being NOT NULL is what lets every repository method
take a required `TenantId`. A null reaching a `WHERE tenant_id = …` matches
nothing, so the failure is a super admin silently seeing an **empty list** rather
than an error. `Principal` is a discriminated union for the same reason: reading
`.tenantId` off a platform admin does not compile.

A platform admin therefore has no access to any tenant's content. That is not a
gap to fill later with an `if` — it is the isolation rule in §1 holding.

---

## 6. Core data model

```
Tenant
  id, name, domain, niche_label
  fb_page_id, fb_page_access_token (encrypted)   — reserved, unused until Phase 2

PlatformAdmin                                    — NOT tenant-scoped, see §5
  id, kratos_identity_id, username, name, email, is_active

Author
  id, tenant_id (FK), kratos_identity_id,
  username,                                      — public identity handle, UNIQUE (tenant_id, username)
  name, email,                                   — email is CONTACT INFO, not identity
  quote, telegram, contact_public,               — public profile
  role [admin|editor|contributor]

Category
  id, tenant_id (FK), name, slug,                 — tenant-scoped taxonomy
  description, position, deleted_at              — nav order; soft delete (retire)

CategorySlugRedirect
  tenant_id, old_slug → category_id              — a changed slug 301s, UNIQUE (tenant_id, old_slug)

Article
  id, tenant_id (FK), author_id (FK), title, slug, content (TipTap block JSON),
  excerpt, cover_image, category_id (FK),
  status [draft|published], published_at
  hook_text, fb_post_id, fb_comment_id            — reserved, unused until Phase 2

Media
  id, tenant_id (FK), url, type, size
```

- `excerpt` and `cover_image` are **mandatory** — they feed `og:description` and
  `og:image`.
- **Every query touching Author / Article / Category / Media filters by
  `tenant_id`.** This is the actual isolation mechanism; the UI is not a control.

See `core-engine/docs/article-status-lifecycle.md` for the status state machine.

---

## 7. Business rules that must hold in any implementation

- **Tenant isolation at the data layer.** Repository methods take `tenant_id` as a
  required, non-optional parameter. No overload omits it.
- **The Article aggregate enforces its own invariants** (cannot publish without
  `excerpt` and `cover_image`). This lives once, in the domain layer.
- **Publishing is immediate and idempotent.** Re-publishing never moves
  `published_at`.
- **There is no message queue.** Background work (image processing) is polled from
  Postgres, so the database is the only source of truth and nothing can be lost by
  a Redis restart. See `core-engine/docs/background-work.md`.
- **Preview before publish is required.** Rendered by the tenant site itself
  (`/_preview/:id`, short-lived signed token) so it uses the real components and
  cannot drift from live output. In-admin/login-only by default.
- **Open Graph tags are server-rendered** on article, category, and home pages —
  `og:title`, `og:description`, `og:image` (absolute URL, ~1200×630), `og:url`,
  `og:site_name`, plus a `twitter:card` fallback. Social crawlers do not run JS.
- **Public endpoints can only ever return `status = published`.** Enforced by a
  separate controller and separate DTOs, not by a conditional.
- **Any table created, dropped or altered updates `core-engine/docs/data-model.md`
  in the same change.** Same rule and same reason as `api-reference.md`: it is a
  contract people read *instead of* the schema files, and a reference that lags is
  worse than none, because it is trusted right up until it is wrong. A new column
  needs a row; a new table needs a section, its foreign keys in the delete table,
  and a line on the map. If a change makes a documented claim false — a nullable
  column becoming NOT NULL, a constraint gaining a partial clause — fixing the doc
  is part of the change, not follow-up work.

---

## 8. Tech stack

| Layer | Choice |
|---|---|
| Public tenant sites | Nuxt 4 (Vue), SSR + ISR |
| Backoffice/Admin UI | Nuxt (Vue) |
| Backend API + worker | NestJS monorepo (`apps/api`, `apps/worker`, `libs/`) |
| Architecture | Domain-Driven Design, one bounded context per lib |
| Background work | Polled from Postgres — no queue |
| ORM | Drizzle |
| Database | PostgreSQL |
| Styling (all frontends) | Tailwind CSS v4 — per-site themes, no shared preset |
| Rich text editor | TipTap (Vue build) |
| Media storage | MinIO (S3-compatible), presigned direct upload |
| Image processing | sharp — og/card/thumb WebP derivatives, worker-side |
| Readership analytics | Umami 3.3.1, self-hosted, internal-only — see `core-engine/docs/readership-analytics.md` |
| Gateway | Kong Gateway OSS, DB-less declarative config |
| Edge auth | Ory Oathkeeper |
| Identity | Ory Kratos |
| API collection | Bruno (`/api`) |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions |
| Monitoring | Uptime Kuma, Grafana + Prometheus/Loki |
| API docs | Swagger (`@nestjs/swagger`) |
| Validation | class-validator / class-transformer |

### Rejected along the way

Strapi (→ custom NestJS + Nuxt admin) · Next.js/React (→ Nuxt/Vue, preference) ·
Prisma/TypeORM (→ Drizzle, preference) · Passport.js JWT (→ Kratos + edge
enforcement) · Caddy/Traefik (→ Kong, for multi-tenant custom-domain TLS) ·
Vercel for the backend (persistent worker + always-on services don't fit) ·
Kong `openid-connect` plugin (Enterprise-only) · Plausible CE / PostHog /
OpenPanel for analytics (→ Umami; each needs ClickHouse, too heavy for one VPS)
· hand-written view aggregation SQL (→ Umami, 2026-09-12).

---

## 9. Open items — not yet decided

Do not implement these without asking.

1. **Preview links.** Login-only, or also a shareable external link for
   outside-stakeholder sign-off? Current design supports both via token TTL.
2. **business-cambodia.com feature ideas** — view counters, "Popular this month",
   per-category homepage preview blocks, ad/banner slots, treating PR/sponsored
   as its own category. Two of these have schema consequences that are cheap now
   and impossible to retrofit:
   - *Recording* article views from launch — **built** on technology-site
     (`article_views` + `article_view_counts`); gaming-site records nothing
     yet. Analysis is decided — Umami, see below.
   - An `is_sponsored` flag on Article (disclosure is a field, not a taxonomy row)
3. Whether the two sites' homepages diverge enough to justify separate layouts.

### Decided, previously open

- **Authors management + a Keto-ready permission layer — decided 2026-09-14, NOT
  built.** Site admins (only) invite authors by a one-time sign-up link shown to
  copy, edit name / email / role, and deactivate or reactivate them; a new site's
  first admin comes from a CLI task. Usernames are locked after creation. A
  deactivated author cannot sign in, the API refuses them, their public page
  404s and bylines render unlinked; their articles stay. Every protected action
  becomes a named permission checked through one port — answered from
  `authors.role` today, so roles still live in ONE place; Keto replaces that one
  adapter later (§5 is unchanged until then). "My profile" is deferred. Open:
  site cache revalidation (see the proposal §2.3). Full plan:
  `docs/proposals/authors-management.md`.
- **Readership analytics via Umami — decided 2026-09-12, built 2026-09-13.** Umami
  (self-hosted, MIT, on the existing Postgres in its own `umami` database, no
  public surface) computes readership for the backoffice dashboard. Views are
  forwarded server-side through `POST /public/v1/views` — no analytics script
  on the sites. `article_views` stays the authoritative raw log, written first;
  Umami is a derived store behind a port, so it can be replaced. Editorial
  figures (publishing pace, pipeline, authors, categories) stay in our database.
  Confirmed the same day: the reader-facing counter stays on our table; the
  authors panel is editor+, by name, unranked; every site records views; time
  is stored UTC and shown in the backoffice viewer's own time zone. Full plan:
  `docs/proposals/dashboard-analytics-umami.md`.
- **Author bio card — decided 2026-08-07, built.** Authors have a public profile
  (`username`, `quote`, contact details) surfaced as a byline on listings, an
  end-of-article card, and an author page at `/author/:username`. Contact details
  are opt-in per author via `contact_public`, defaulting to **false**. Article
  *count* is derived from the author's article list, not stored. Built on
  technology-site only; gaming-site is a follow-up.
- **Author identity is `username`, not email — decided 2026-08-07.** See §5.

---

## 10. Where the detail lives

| Doc | Contents |
|---|---|
| `core-engine/CLAUDE.md` | NestJS + DDD architecture, layering, module wiring, what not to do |
| `core-engine/docs/` | Status lifecycle, API conventions, auth flow, tenant isolation, scheduling, media — **read before changing backend code** |
| `core-engine/docs/data-model.md` | **The schema contract.** Every table, foreign key, delete rule and constraint pattern, plus what is deliberately not modelled — so it must be updated in the same change as any table (see §7). |
| `core-engine/docs/api-reference.md` | **The response contract.** Frontends hand-write their types from this rather than from codegen or a shared package (decided 2026-08-08) — so it must be updated in the same change as any endpoint. |
| `backoffice/CLAUDE.md` | Backoffice UI: Kratos flows, the API proxy, editor, preview |
| `websites/CLAUDE.md` | What the public sites do, OG spec, ISR/revalidation contract |
| `websites/*/CLAUDE.md` | Per-tenant domain knowledge |
| `infrastructure/CLAUDE.md` | Compose topology, gateway/identity config, backups, monitoring |
| `/api` | Bruno collection — the live shape of every endpoint |
| `docs/proposals/` | Approved plans not yet built. Read the relevant one before implementing it; once built, the docs it names become the source of truth. Open: `authors-management.md`. Built and kept as history: `dashboard-analytics-umami.md`. |
| `core-engine/docs/readership-analytics.md` | View recording, dashboard analytics, Umami: the two stores, isolation, verified API facts, operating tasks |

---

## 11. Project skills

Workflows in `.claude/skills/`, available to Claude Code in this repo.

| Skill | Covers |
|---|---|
| `fullstack-feature` | The end-to-end workflow for any non-trivial change: read design *and* real code state → compare against decisions → ask about gaps → propose → implement → test → verify → update docs. Carries NestJS and Nuxt craft detail in `references/`. |
| `frontend-design` | UI work across the two sites and the admin. Delegates design craft to [impeccable](https://impeccable.style/); enforces the constraints impeccable can't know — the two sites must look unrelated, no render-blocking calls on ISR paths, cover image doubles as `og:image`, admin is a tool not a publication. |
| `add-bounded-context` | Taking one of the empty `libs/` contexts to wired-and-building |
| `add-api-endpoint` | Public/admin surface split, transition verbs, error mapping, Bruno |
| `change-db-schema` | Tenant-leading constraints, additive migrations, reading generated SQL |
| `tenant-isolation-audit` | Reviewing for cross-tenant leaks before shipping |

They deliberately **point at the docs above rather than restating them** — the
`CLAUDE.md` files hold decisions, `core-engine/docs/` holds rules, and the skills
hold procedure and craft. Keeping that split is what stops the three drifting.

### Vendored impeccable — decided 2026-08-09

`.claude/skills/impeccable/` is third-party (Apache 2.0, currently **v4.0.4**) and
is **committed on purpose**. It is in no `package.json`, so nothing else pins it;
committing the tree is what stops `npx impeccable install` handing two developers
different design guidance. Bump it deliberately, as its own commit.

`npx impeccable install` also writes a second, near-identical copy for GitHub
Copilot — `.github/skills/impeccable/`, `.github/agents/impeccable-*.agent.md`,
`.github/hooks/impeccable.json`. Those are **gitignored**. The two copies differ
only by a hardcoded install path and a provider constant, so they cannot be
symlinked, and committing both doubles 3.2 MB while guaranteeing they drift the
first time only one is refreshed. If the team ever adopts the Copilot CLI or
cloud agent, note that its hook fires only once `.github/hooks/impeccable.json`
is committed to the default branch — un-ignore those three paths then, and expect
to re-run the installer whenever the Claude Code copy is bumped.
