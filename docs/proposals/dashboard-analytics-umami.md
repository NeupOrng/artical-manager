# Proposal — Dashboard analytics with Umami

| | |
|---|---|
| Status | **Built** — slices 1–8 on 2026-09-12, 9–12 on 2026-09-13. This file is now history; the reference is `core-engine/docs/readership-analytics.md`. See §11 for what changed from this plan while building. |
| Owner | Implemented by Claude (Opus 5), reviewed by the user |
| Touches | `infrastructure/`, `core-engine/` (schema, `libs/article`, `apps/api`), `backoffice/`, both `websites/*`, `/api` (Bruno) |
| Design | The wireframe approved in session 2026-09-12 — KPI strip with period deltas, views-per-day chart with publish markers, top articles, views by category, publishing pipeline, authors panel. This plan adds a **Top sources** card, now cheap because Umami provides it. |

---

## 0. How to use this document (read first, implementer)

1. **Read before touching anything:** root `CLAUDE.md`, `core-engine/CLAUDE.md`,
   `core-engine/docs/{tenant-isolation,api-conventions,api-reference,database-and-migrations}.md`,
   `backoffice/CLAUDE.md`, `websites/CLAUDE.md`, `infrastructure/CLAUDE.md`.
   Follow the `fullstack-feature` skill; use `change-db-schema`, `add-api-endpoint`
   and `frontend-design` for their parts.
2. §2.2 is **confirmed** (2026-09-12). Do not re-ask.
3. **Verify §9 against the pinned Umami version** before writing the adapter.
   Every item there is a claim about a third-party API that changes between
   versions. Record what you found in `core-engine/docs/readership-analytics.md`.
4. Build in the slice order of §6. `task check` must be green after every slice;
   `task test:integration` after slices that touch the API.
5. Do **not** commit or push unless the user asks. Never commit `.env`.
6. When done, move this file's status to "Built", and make the docs in §8 the
   source of truth — this proposal becomes history, not reference.

---

## 1. Goal and scope

The dashboard shows counts and a recent list; it does not help anyone judge what
is working. Add readership analysis (views over time, top articles, sources,
category/author breakdowns) and editorial analysis (publishing pace, pipeline),
for three audiences:

| Principal | Sees |
|---|---|
| contributor | "Your stories": the same layout scoped to **their own** articles, no authors panel, no site-wide figures |
| editor / admin | Everything in the wireframe, site-wide |
| platform admin | Existing per-site table + a 30-day views figure per site. **Aggregates only, never titles** — root `CLAUDE.md` §5 |

### Non-goals

- Real-time "readers on site now", engaged time, scroll depth, heatmaps.
- Giving editors Umami's own UI. It bypasses our roles and tenant model; the
  backoffice is the only analytics surface.
- Replacing the reader-facing view counter (see D2).
- Newsletter/member analytics — those features do not exist.
- Breakout notifications (later proposal).

---

## 2. Decisions

### 2.1 Made

| # | Decision | Why |
|---|---|---|
| M1 | **Umami** (self-hosted, MIT) computes readership analytics. We do not write aggregation SQL over `article_views` for the dashboard. | Gives sources, unique visitors, devices, countries and bot filtering we would not build. One container on the Postgres we already run. Plausible CE / PostHog / OpenPanel need ClickHouse — too heavy for one VPS. |
| M2 | **Editorial figures stay in our database** (publish pace, pipeline, author/category of an article). | Umami knows URLs, not drafts, authors or categories. |
| M3 | **`article_views` stays the durable log** and keeps being written first. Umami is a derived analytics store. | Root `CLAUDE.md` §7: the database is the source of truth. If Umami loses data or is replaced, the raw log remains. |
| M4 | Umami sits behind a **port** (`ReadershipAnalytics`) in `libs/article`. | Swappable; testable with an in-memory fake; no sixth bounded context (`core-engine/CLAUDE.md`). |
| M5 | Charts are **hand-drawn SVG components**, no chart library. | Five simple shapes; matches the authored `AppIcon` approach; no dependency, full control of tokens/dark mode. Revisit only if interactive tooltips grow beyond one component. |

### 2.2 Confirmed by the user, 2026-09-12

| # | Question | Decision | Consequence of the other answer |
|---|---|---|---|
| D1 | How do views reach Umami? | **Server-side forwarding through core-engine** (§3). No Umami script on the sites. | Script tag: simpler, but ad-blocked (~25–40% of tech readers), another script on ISR pages, and Umami must be internet-facing. |
| D2 | Reader-facing view counter | **Keep on `article_view_counts`.** Dashboard numbers come from Umami; the two may differ slightly (bot filtering). Label dashboard views as Umami's. | Move to Umami: puts a third-party lookup on the public read path. |
| D3 | Authors panel | **Editor+, sorted by name, no rank numbers**; shows published count and views. | Ranked leaderboard, or counts only. Team-culture call. |
| D4 | View recording | **Every site records views the same way** (tech and gaming now, any future site by the same pattern). | — |
| D5 | Time zones | **Store UTC** (unchanged). **Display in the backoffice viewer's own time zone**: the browser's IANA zone is sent as `tz` on the analytics request; day buckets, windows and the chart use it. No per-tenant zone column. | — |

---

## 3. Architecture

### Recording (write path)

```
reader browser (article page, once per article per session)
  │  POST /api/views   { articleId, referrer: document.referrer, language, screen }
  ▼
site Nitro  server/api/views.post.ts
  │  adds  X-Reader-Ip (getRequestIP, x-forwarded-for aware), X-Reader-User-Agent
  │  tenant key attached server-side (unchanged)
  ▼
Kong  /public/v1/views  (existing public-write route, rate limited)
  ▼
NestJS PublicViewsController.record
  1. ArticleViewRepository.record()  → article_views + article_view_counts   (UNCHANGED, authoritative)
  2. only if 1 succeeded (article exists, this tenant, published):
     ReadershipAnalytics.track(site, hit)   — fire-and-forget, 1.5 s timeout,
     failure logged at warn WITHOUT ip/user-agent, never fails the request
  ▼
Umami  POST /api/send   (docker-internal network only)
```

Why through core-engine rather than site → Umami directly:

- Sites deploy to a managed host; Umami stays on the VPS's **internal** network
  with no public surface at all.
- The API already resolves the tenant from the key and checks the article is
  published — the same gate now protects the analytics data.
- The **path and title are built server-side** from the article row
  (`/article/<slug>`, `article.title`), never taken from the client, so a caller
  cannot pollute Umami with arbitrary URLs.
- The Umami website id never appears in site config.

### Reading (dashboard)

```
backoffice /  ──► /api/backend/dashboard/analytics?range=30d ──► Kong ──► Oathkeeper
  ▼
DashboardAnalyticsController (@CurrentAuthor, contributor+)
  ▼
buildDashboardAnalytics(principal, range, now)        libs/article/application
  ├─ editorial:  ArticleRepository (our Postgres, tenant-scoped)
  └─ readership: ReadershipAnalytics port ──► UmamiReadershipAnalytics adapter ──► Umami REST
       results keyed by path → joined to articles by (tenant_id, slug) in OUR database
```

**Tenant isolation rule for readership:** the Umami website id is read from the
caller's own tenant row inside the use case and passed to the adapter. The adapter
never chooses a website and never accepts one from a request. A unique index on
`tenants.umami_website_id` makes "two tenants share one website" impossible.

---

## 4. Inventory — what exists and needs a small enhancement

| Area | Exists | Enhancement | Slice |
|---|---|---|---|
| Infra | `infrastructure/compose/docker-compose.yml` (postgres 17, api, worker…) | Add `umami` service | 1 |
| Infra | `infrastructure/postgres/init/01-ory-databases.sql` (runs on empty volume only) | Add `02-umami-database.sql`; plus a task for existing volumes | 1 |
| Infra | `infrastructure/env/.env.example` | Add `UMAMI_*` keys (placeholders + dev defaults, like `SUPER_ADMIN_PASSWORD`) | 1 |
| Infra | Uptime Kuma, backups (`infrastructure/CLAUDE.md`) | Heartbeat check on Umami; include `umami` database in backups | 1 |
| Schema | `tenants` table | `umami_website_id uuid NULL` + partial unique index | 2 |
| Seed | `libs/database/src/seed/*` (tenants, authors, admin) | New provisioning + dev view seed scripts | 3, 10 |
| API | `PublicViewsController` + `RecordViewDto { articleId }` | DTO gains optional `referrer`, `language`, `screen`; controller calls `track()` after `record()` | 4 |
| API | `ArticleViewRepository.record()/totalsFor()` (`libs/article/src/application/view-ports.ts`) | Unchanged — named here so nobody "simplifies" it away | — |
| API | `ArticleRepository` (`libs/article/src/application/ports.ts`) — `getStats`, `listRecent`, `listForAdmin` | New read methods (§5 Slice 6); `listForAdmin` gains `readiness` filter | 6, 8 |
| API | Article domain's `missingToPublish` derivation | Reused as the single definition of "ready" for pipeline counts | 6, 8 |
| API | `GET /admin/v1/dashboard` + `dashboard.dto.ts` | Unchanged for authors. Platform DTO gains `views30d` per tenant (nullable) | 7 |
| API | `ListArticlesQuery` | `readiness=ready|needs-excerpt|needs-cover` | 8 |
| Backoffice | `pages/index.vue` (author + platform branches) | Rebuilt to the wireframe; branches kept | 9 |
| Backoffice | `StatFigure` (label, value, hint) | Optional `delta` (+/−, with text, not colour alone) | 9 |
| Backoffice | `useDashboard()` | Unchanged; new `useDashboardAnalytics(range)` beside it | 9 |
| Backoffice | URL-held filters pattern (`pages/articles/index.vue`) | Reused for `?range=` and `?readiness=` | 8, 9 |
| Backoffice | `AppIcon` | Add icons as needed (`trend-up`, `trend-down`, `source`) on the same 16-grid | 9 |
| Tech site | `useArticleViews`, `server/api/views.post.ts`, `publicApiPost` | Send `referrer`/`language`/`screen`; forward reader IP + UA headers | 4 |
| Gaming site | — nothing recorded | Port the tech-site recording pieces (D4) | 4 |
| Kong | `public-write-api` route for `/public/v1/views` | No change; confirm custom `X-Reader-*` headers pass through | 4 |

## 5. Inventory — what does not exist and must be built

| # | New | Where |
|---|---|---|
| N1 | Umami service, database, env, heartbeat, backup entry | `infrastructure/` |
| N2 | `tenants.umami_website_id` migration | `libs/database` |
| N3 | Provisioning task: create one Umami website per tenant, store its id | `libs/database/src/seed/analytics.ts`, `Taskfile.yml` |
| N4 | `ReadershipAnalytics` port + in-memory fake | `libs/article/src/application/readership-ports.ts` |
| N5 | `UmamiReadershipAnalytics` adapter (auth, timeouts, cache, mapping) | `libs/article/src/infrastructure/umami-readership.analytics.ts` |
| N6 | `analyticsWindow(range, now, tz)` pure domain function | `libs/article/src/domain/analytics-window.ts` |
| N7 | `buildDashboardAnalytics` use case (merge, scope, degrade) | `libs/article/src/application/dashboard-analytics.ts` |
| N8 | `GET /admin/v1/dashboard/analytics` + DTOs | `apps/api/src/modules/dashboard/` |
| N9 | Backoffice components: `ViewsChart`, `Sparkline`, `ShareBar`, `RangeTabs`, `PipelineList`, `SourcesList`, `AuthorsPanel` | `backoffice/app/components/` |
| N10 | Dev view seed (`task db:seed:views`) | `libs/database/src/seed/views.ts` |
| N11 | Integration suite `dashboard-analytics.int.spec.ts`; adapter contract test | `core-engine/test/integration/` |
| N12 | `core-engine/docs/readership-analytics.md` — the rules of this feature | `core-engine/docs/` |

---

## 6. Work breakdown — slices in build order

Each slice lists files, what to do, and acceptance criteria. Keep the repo green
between slices.

### Slice 1 — Infrastructure: Umami service

- `infrastructure/compose/docker-compose.yml`: service `umami`
  - image: the **PostgreSQL build of the latest stable Umami, pinned to an exact
    tag** (no `latest`). Record the tag in `infrastructure/CLAUDE.md`.
  - `DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/umami`
  - `APP_SECRET=${UMAMI_APP_SECRET}`, `CLIENT_IP_HEADER=x-reader-ip` (verify name, §9)
  - `DISABLE_TELEMETRY=1`; `depends_on: postgres (healthy)`; healthcheck on `/api/heartbeat`
  - **Ports:** dev only, bound to `127.0.0.1:${UMAMI_PORT}` for inspecting data.
    In production no published port; not routed through Kong.
- `infrastructure/postgres/init/02-umami-database.sql`: `CREATE DATABASE umami;`
  with a header comment in the style of `01-ory-databases.sql` (separate
  database, why).
- `Taskfile.yml`: `analytics:db` — idempotent create for **existing** volumes
  (init scripts only run on an empty data dir):
  `SELECT 'CREATE DATABASE umami' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='umami')\gexec`
- `infrastructure/env/.env.example`: `UMAMI_PORT=3300`,
  `UMAMI_APP_SECRET=replace-me-…`, `UMAMI_INTERNAL_URL=http://umami:3000`,
  `UMAMI_ADMIN_USERNAME=admin`, `UMAMI_ADMIN_PASSWORD=artical-dev-umami-2026`
  (dev default — the provisioning task refuses it when `NODE_ENV=production`,
  mirroring `SUPER_ADMIN_PASSWORD`).
- `api` service env: `UMAMI_INTERNAL_URL`, `UMAMI_ADMIN_USERNAME`, `UMAMI_ADMIN_PASSWORD`.
  (No timezone env — the zone comes from the viewer, D5.)
- Monitoring: Uptime Kuma HTTP check on Umami heartbeat (internal).
- Backups: add `umami` to whatever the backup job dumps. It is regenerable from
  nothing, but losing it loses history `article_views` does not carry (sources,
  devices).

**Accept:** `task dev` brings Umami up healthy; `task analytics:db` is a no-op on
second run; Umami UI reachable on `127.0.0.1:3300` in dev only; `docker compose
config` shows no published Umami port in the production compose.

### Slice 2 — Schema: `tenants.umami_website_id`

- `libs/database/src/schema/tenants.ts`: `umamiWebsiteId: uuid('umami_website_id')`
  **nullable permanently** — null means "analytics not provisioned" and is a
  normal, rendered state. Partial unique index
  `tenants_umami_website_key ON (umami_website_id) WHERE umami_website_id IS NOT NULL`.
- Generate, **read the SQL**, migrate, `\d tenants` (`change-db-schema` skill).
- Additive and nullable, so the one-step path is correct here.

**Accept:** migration applied; existing tenant rows unaffected; the domain/tenant
types expose it only where the use case needs it (not on public DTOs).

### Slice 3 — Provisioning

- `libs/database/src/seed/analytics.ts` + `task analytics:provision`
  (depends on Umami up):
  1. Log in to Umami with `UMAMI_ADMIN_*` (default Umami credentials are
     `admin`/`umami` on first boot — rotate to the env password, then refuse the
     default thereafter).
  2. For each tenant: if `umami_website_id` is set and that website exists → skip;
     else create a website (`name = tenant.name`, `domain = tenant.domain`) and
     store its id.
  3. Print tenant → website id.
- Idempotent; safe to re-run. Refuses the dev password in production.

**Accept:** two runs produce the same ids; both seeded tenants have distinct ids.

### Slice 4 — Recording: forward views to Umami

**Sites (both):**
- `app/composables/useArticleViews.ts` (tech; port to gaming): include
  `referrer: document.referrer || null`, `language: navigator.language`,
  `screen: \`${screen.width}x${screen.height}\`` in the POST body. Once-per-session
  behaviour unchanged.
- `server/api/views.post.ts`: validate the new optional fields (strings, length
  caps); forward to `publicApiPost('/views', body, headers)` with
  `X-Reader-Ip: getRequestIP(event, { xForwardedFor: true })` and
  `X-Reader-User-Agent: getRequestHeader(event, 'user-agent')`.
  Extend `publicApiPost` to accept extra headers.
- Gaming: port `useArticleViews`, `views.post.ts`, `views.get.ts`, `publicApiPost`
  and call the composable from `app/pages/article/[slug].vue`. Displaying the
  count to gaming readers is **not** required (D4 is recording only).

**API:**
- `RecordViewDto`: optional `referrer` (≤2048), `language` (≤35), `screen` (≤20,
  `/^\d{2,5}x\d{2,5}$/`). Still `forbidNonWhitelisted`.
- `PublicViewsController.record`: after `ArticleViewRepository.record()` returns
  non-null, call `readership.track(site, { path: '/article/' + slug, title,
  referrer, language, screen, ip, userAgent, hostname: tenant.domain })` **without
  awaiting the request's completion on the response path** (catch + warn log).
  Needs the article's slug/title: extend `record()`'s return or do one tenant-scoped
  lookup — prefer extending the return to avoid a second query.
- Skip `track()` when the tenant has no `umami_website_id`.
- Never log IP or user agent. Never persist them in our database.

**Kong:** confirm `X-Reader-Ip` / `X-Reader-User-Agent` reach the API (Kong passes
unknown headers by default; the identity-header strip must not catch them).
Note in `docs/readership-analytics.md` that these headers are only trustworthy
because the tenant key never leaves a site's server.

**Accept:** reading an article on either site creates one `article_views` row and
one Umami pageview with correct path, referrer domain and device; stopping Umami
does not change the `POST /public/v1/views` response or latency beyond the timeout.

### Slice 5 — Port and Umami adapter

`libs/article/src/application/readership-ports.ts`:

```ts
export const READERSHIP_ANALYTICS = Symbol('READERSHIP_ANALYTICS');

/** Resolved by the use case from the caller's tenant row. Never from input. */
export interface ReadershipSite { tenantId: TenantId; websiteId: string; hostname: string }
export interface Window { from: Date; to: Date; timezone: string }

export interface ReadershipAnalytics {
  track(site: ReadershipSite, hit: ReadershipHit): Promise<void>;
  summary(site: ReadershipSite, w: Window, filter?: { path?: string }): Promise<{ views: number; visitors: number }>;
  daily(site: ReadershipSite, w: Window, filter?: { path?: string }): Promise<{ date: string; views: number }[]>;
  byPath(site: ReadershipSite, w: Window, limit: number): Promise<{ path: string; views: number }[]>;
  bySource(site: ReadershipSite, w: Window, limit: number): Promise<{ source: string; views: number }[]>;
}
```

`libs/article/src/infrastructure/umami-readership.analytics.ts`:
- Auth: login with the service credentials, cache the token, re-login once on 401.
- Every call: 2 s timeout (`AbortSignal.timeout`), throws a typed
  `ReadershipUnavailableError` on network/5xx/timeout.
- `daily()` returns **every** day in the window — fill gaps with 0 here so the
  contract is "dense series", whatever Umami returns.
- `bySource()`: referrer domains; empty referrer → `"Direct / unknown"`; collapse
  `m.facebook.com`, `l.facebook.com`, `lm.facebook.com` → `facebook.com` (and the
  same for `t.co`→`x.com`, `google.*`→`google`). Keep the mapping table in the
  adapter with a unit test.
- 60 s in-memory cache keyed by `(websiteId, method, window, filter)`. Single VPS,
  single API instance — fine. Do not cache `track`.
- In-memory fake `FakeReadershipAnalytics` (test helper) implementing the port
  over an array of hits — used by all application tests.

**Accept:** adapter contract test against the dev Umami passes (Slice 11); unit
tests for source normalisation and gap filling pass.

### Slice 6 — Domain + application: build the analytics response

`libs/article/src/domain/analytics-window.ts` — pure, no `Date.now()`:
- `analyticsWindow(range: '7d'|'30d'|'90d', now: Date, tz: string)` →
  `{ current: {from,to}, previous: {from,to}, days: string[] }`.
  `current.from` = start of day (in `tz`) of `now − (n−1) days`; `current.to = now`;
  `previous` = the same length immediately before. `days` lists every date in
  `current`.
- Unit tests: month/year boundaries, DST in a non-UTC zone, `previous` exactly
  adjacent, `days.length === n`.

`ArticleRepository` — new tenant-scoped reads (`tenantId` first, required):
- `publishedBetween(tenantId, from, to, opts: { authorId?: string })` →
  `{ id, slug, title, authorId, authorName, categoryId, categoryName, categoryRetired, publishedAt }[]`
  (feeds publish markers, published counts, first-week figure).
- `findPublishedBySlugs(tenantId, slugs[])` → same row shape (the path → article join).
  Retired categories keep their label here (admin surface), flagged `categoryRetired`.
- `pipeline(tenantId, opts: { authorId?: string })` →
  `{ ready, needsExcerpt, needsCover, lastPublishedAt }` over **drafts**.
  The predicates must match the domain's `missingToPublish` exactly — add a test
  that classifies the same fixtures through both and asserts equal counts.
- Each gets a tenant-isolation repository test (same slug in both tenants).

`libs/article/src/application/dashboard-analytics.ts` —
`buildDashboardAnalytics({ principal, tenant, range, now, tz })`:
1. Window from N6.
2. Scope: contributor → `authorId = principal.authorId`, `scope: 'mine'`;
   editor/admin → site-wide, `scope: 'site'`.
3. Editorial (always): published counts current/previous, `publishedByDay`,
   pipeline, authors (editor+ only: name + published count).
4. Readership:
   - tenant has no website id → `{ status: 'not-connected' }`.
   - else in parallel: `summary` ×2 (current, previous), `daily`, `byPath(500)`,
     `bySource(6)`.
   - Map paths `^/article/([a-z0-9-]+)$` → slugs → `findPublishedBySlugs`.
     Unknown/unpublished paths are dropped (not an error).
   - **Contributor scope:** keep only their articles from `byPath`; `views` =
     sum of those; `daily` = per-path `daily` for their top 20 by views, summed
     (documented cap); `summary.visitors` = null for `mine` (visitors cannot be
     summed across paths honestly — render "—").
   - `topArticles`: top 5 mapped articles; per-article `daily` for sparklines
     (5 calls).
   - `byCategory`: sum mapped views per category; `categoryId: null` →
     "Uncategorised"; retired → name + `retired: true`; `share` computed here,
     rounded so the list sums to 1.
   - `authors` views: sum mapped views per author (editor+ only).
   - `firstWeekViewsPerNewArticle`: for articles published in the window whose
     7-day window has started, `summary({path})` over `[publishedAt, +7d]`, cap 20,
     average; null if none.
   - Any `ReadershipUnavailableError` → `{ status: 'unavailable' }` for the whole
     readership block. **Editorial is still returned; HTTP stays 200.**
5. Total Umami calls worst case (editor, 30d): ~5 + 5 + ≤20 ≈ 30, parallelised,
   then cached 60 s. Acceptable at ~10 users; noted as a known cost.

Application tests use `FakeReadershipAnalytics` + in-memory article fakes:
scoping, dropping unknown paths, share rounding, degrade statuses, no authors for
contributors, retired/uncategorised grouping.

### Slice 7 — Transport

`apps/api/src/modules/dashboard/`:
- `GET /admin/v1/dashboard/analytics?range=7d|30d|90d&tz=<IANA zone>` (defaults
  `30d`, `UTC`). `tz` validated against `Intl.supportedValuesOf('timeZone')` —
  an unknown zone is a 400, never silently UTC. Cache keys include `tz`.
  `@Roles('contributor')`, `@CurrentAuthor()` — a platform admin is refused
  (verify the status the decorator produces; document it).
- Wire `READERSHIP_ANALYTICS → UmamiReadershipAnalytics` in the dashboard module
  **and** the public module (for `track`).
- DTOs mirror the shape below; Swagger on everything.
- Platform dashboard: each tenant gains `views30d: number | null` (null = not
  connected or Umami unavailable). One `summary` per tenant, parallel, cached.

Response (the contract — copy into `api-reference.md`):

```jsonc
{
  "range": "30d",
  "timezone": "UTC",
  "scope": "site",                                  // "mine" for contributors
  "current":  { "from": "2026-08-14T00:00:00Z", "to": "2026-09-12T15:04:00Z" },
  "previous": { "from": "2026-07-15T00:00:00Z", "to": "2026-08-14T00:00:00Z" },

  "editorial": {
    "published": { "current": 3, "previous": 4 },
    "publishedByDay": [ { "date": "2026-08-14", "count": 0 } ],   // dense, one per day
    "pipeline": { "ready": 2, "needsExcerpt": 1, "needsCover": 1,
                  "lastPublishedAt": "2026-09-08T09:12:00Z" }      // null if never
  },

  "authors": [                                     // null for contributors
    { "authorId": "…", "name": "Mara Okonkwo", "published": 2, "views": 1300 }  // views null unless readership ok
  ],

  "readership": {
    "status": "ok",                                // "not-connected" | "unavailable" → no other keys
    "views":    { "current": 2107, "previous": 1786 },
    "visitors": { "current": 1402, "previous": 1210 },   // null when scope = "mine"
    "firstWeekViewsPerNewArticle": 412,            // null if nothing qualifies
    "daily": [ { "date": "2026-08-14", "views": 40 } ],   // dense
    "topArticles": [
      { "articleId": "…", "title": "…", "slug": "…", "authorName": "…",
        "categoryName": "Guides", "publishedAt": "…", "views": 612,
        "daily": [3, 5, 9] }                        // aligned to "daily" dates
    ],
    "byCategory": [
      { "categoryId": "…", "name": "Guides", "retired": false, "views": 1160, "share": 0.55 }
    ],
    "sources": [ { "source": "facebook.com", "views": 900 } ]
  }
}
```

- Bruno: `api/admin/dashboard/analytics.bru` (+ a contributor-scope example,
  + range variants); docs block explains the three readership statuses.

**Accept:** Swagger shows the endpoint; `api-reference.md` matches the DTOs.

### Slice 8 — `readiness` filter on the article list

- `ListArticlesQuery.readiness?: 'ready'|'needs-excerpt'|'needs-cover'` (implies
  `status=draft`); repository predicate shared with `pipeline()` (one definition,
  one test proving list count == pipeline count).
- Backoffice `pages/articles/index.vue`: removable chip like the category chip;
  empty-state condition updated; `useArticles` passes it through; types updated.

**Accept:** each pipeline row links to a list whose total equals the row's number.

### Slice 9 — Backoffice UI

Use the `frontend-design` skill (impeccable craft floor). Tokens only; light and
dark. Admin is a tool: density over decoration.

- `app/types/api.ts`: `DashboardAnalytics` etc., hand-written from `api-reference.md`.
- **Viewer time zone (D5):** a client plugin writes the browser's zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) to an `artical_tz` cookie.
  The composable reads it with `useCookie` (default `UTC`) and sends it as `tz`,
  so SSR renders in the viewer's zone from the second visit on; on the very first
  visit SSR uses UTC and the client refetches once if the zone differs. Show the
  zone in the chart footnote ("Days in Asia/Phnom_Penh").
- `app/composables/useDashboardAnalytics.ts`: `useAsyncData` keyed
  `dashboard-analytics:${range}:${tz}` via `useRequestFetch` (SSR cookie rule).
- Components (props in parentheses):
  - `RangeTabs` (`modelValue`) — segmented control, writes `?range=`.
  - `StatFigure` + `delta` (`current`, `previous`, `format`) — "+18% vs prior 30 days"
    as text; direction icon; never colour alone; "—" when previous is 0.
  - `ViewsChart` (`days`, `views`, `published`) — SVG area + line, dots for publish
    days, horizontal gridline at the midpoint, x labels at start/mid/end,
    keyboard-focusable points with a tooltip (date, views, titles published), and a
    visually hidden `<table>` of the same data for screen readers.
  - `Sparkline` (`values`) — 60×18, decorative (`aria-hidden`), the number beside it
    is the accessible value.
  - `ShareBar` (`items`) — name, percent, bar; "Retired" suffix in muted text.
  - `SourcesList` (`items`) — top sources with share.
  - `PipelineList` (`pipeline`) — rows link to `/articles?readiness=…`;
    "Last published 4 days ago".
  - `AuthorsPanel` (`authors`) — editor+, sorted by name (D3).
- `pages/index.vue` layout (desktop): header + `RangeTabs`; KPI row (Views,
  Published, Views per new article, Ready to publish); `ViewsChart`; two columns —
  left `TopArticles` table, right `ShareBar` · `SourcesList` · `PipelineList` ·
  `AuthorsPanel`; "Recently edited" (5 rows) last. Tablet: single column.
- States, each designed on purpose:
  - loading: skeletons matching the layout (existing pattern);
  - `readership.status = 'not-connected'`: editorial parts render; readership
    cards replaced by one quiet panel "View analytics are not set up for this site";
  - `'unavailable'`: same, "View analytics are temporarily unavailable — editorial
    figures below are current";
  - no views yet: chart renders flat with "No views recorded in this period";
  - contributor: heading "Your stories", no authors panel, visitors "—".
- Platform admin branch: add `views30d` column ("—" when null) to the existing table.
- Footnote under the chart: "Views are counted once per article per browser
  session and filtered for bots. They may differ slightly from the count shown
  on the site."
- SSR: derive everything with `computed`, not `watch` (the categories page bug,
  see `backoffice/CLAUDE.md`).

**Accept:** renders server-side as editor, contributor and platform admin
(verify SSR HTML like the categories page was verified); `nuxi typecheck` clean;
no hydration warnings; works at tablet width.

### Slice 10 — Dev data

- `libs/database/src/seed/views.ts` + `task db:seed:views` (dev only; refuses
  production): generate ~90 days of hits for each tenant's published articles —
  baseline noise, a spike on each article's publish day decaying over ~5 days,
  a mix of referrers (facebook, google, direct, x.com) and devices.
- Send through the **adapter's `track()`** with backdated timestamps if the
  pinned Umami accepts a timestamp on `/api/send` (§9). If it does not, fall
  back to inserting into Umami's own tables **in dev only**, isolated in this one
  script, with a comment naming the Umami version it was written against.
- Also insert matching `article_views` rows so both stores tell the same story.

**Accept:** after `task db:seed && task analytics:provision && task db:seed:views`,
the dashboard shows a believable 90-day chart for both tenants.

### Slice 11 — Tests

| Layer | Tests |
|---|---|
| Domain | `analyticsWindow` (boundaries, DST, adjacency, dense days) |
| Application | `buildDashboardAnalytics` with fakes: site vs mine scope; unknown paths dropped; share sums to 1; `not-connected` / `unavailable` keep editorial; authors null for contributors; retired + uncategorised grouping; first-week cap |
| Repository | `publishedBetween`, `findPublishedBySlugs`, `pipeline` — tenant isolation (same slug both tenants); pipeline predicate == domain `missingToPublish` |
| Adapter | unit: source normalisation, gap filling, 401 re-login, timeout → typed error. **Contract** (integration, dev Umami): track → summary/daily/byPath reflect it |
| Gateway integration (`dashboard-analytics.int.spec.ts`) | shape; **tech editor's response contains no gaming article ids/paths** while Umami holds both tenants' hits; contributor sees only own articles and `authors: null`; platform admin refused on analytics, gets `views30d` on the platform dashboard; `readiness` list totals == pipeline counts; `POST /public/v1/views` still 200 and fast with Umami stopped (regression for fire-and-forget) |
| Regression | existing dashboard response unchanged for authors; existing views tests pass |

Umami-down tests stop and start the container; mark them so they are easy to
skip locally, but do not make them silently pass (see `vitest.integration.config.ts`
header).

### Slice 12 — Docs (same change, not after)

See §8.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Umami API differs between versions | Exact image tag; adapter contract test; everything version-specific confined to one adapter file |
| Umami down or slow | Fire-and-forget on write (1.5 s cap); `unavailable` status on read; editorial always renders; `article_views` keeps the raw log |
| Reader IP handling | Only forwarded to Umami on the internal network; never logged or stored by us; Umami hashes sessions (confirm it stores no raw IP — §9); document in `readership-analytics.md` |
| Forged `X-Reader-*` headers | Only a holder of the tenant key can call the route, and the key is server-only. Worst case is skewed geo/device data for that tenant, not a breach |
| Request fan-out (~30 Umami calls) | Parallel + 60 s cache; caps documented; revisit if authors grow |
| Dashboard views ≠ site counter | Expected (bot filtering, D2); footnote says so |
| Slug changes orphan history | Published slugs are locked; only unpublish → rename → republish loses old-path views. Accepted, documented |
| Cross-tenant leak via Umami | Website id only from the caller's tenant row; unique index; integration test with both tenants' data present |

## 8. Documentation updates (part of the change)

| File | Update |
|---|---|
| `core-engine/docs/readership-analytics.md` (new) | The rules: Umami is derived, `article_views` authoritative; recording path and why through core-engine; tenant → website mapping; header trust model; privacy; degrade behaviour; verified Umami facts (§9) with version |
| `core-engine/docs/api-reference.md` | Analytics endpoint contract; `views30d`; `readiness` filter; `RecordViewDto` new fields |
| `core-engine/docs/api-conventions.md` | Route list entries |
| `core-engine/CLAUDE.md` | Doc table row for `readership-analytics.md`; note the port/adapter in `libs/article` |
| `backoffice/CLAUDE.md` | Dashboard section: components, states, scope by role, SVG-no-library decision |
| `websites/CLAUDE.md` | View recording now on both sites; fields sent; no Umami script by decision |
| `infrastructure/CLAUDE.md` | Umami service, pinned tag, `umami` database, not public, provisioning and `analytics:db` tasks, backups, heartbeat |
| Root `CLAUDE.md` | §8 Umami status "planned" → "built"; §10 pointer to `readership-analytics.md`; mark this proposal Built |
| `README.md` | Quick start gains `task analytics:provision` and optional `task db:seed:views`; Umami dev UI URL and dev login |
| `/api` (Bruno) | Analytics requests; views request body with new optional fields |

## 9. Verify against the pinned Umami version before coding the adapter

These are claims about a third-party API. Confirm each from that version's docs
or source, and record the answer in `readership-analytics.md`:

1. `/api/send` payload shape for a pageview (`website`, `hostname`, `url`,
   `title`, `referrer`, `language`, `screen`) and whether a **timestamp** can be
   supplied (Slice 10 depends on it).
2. The env var that makes Umami read the client IP from a custom header
   (`CLIENT_IP_HEADER`?) and that it then uses it for geo + session hashing.
3. That the `User-Agent` of the `/api/send` request is what Umami uses for device
   and bot detection — i.e. the adapter must set it to the reader's UA.
4. Self-hosted API auth: login endpoint, token format and lifetime (API keys may
   be cloud-only).
5. Stats / pageviews / metrics endpoints: parameter names (`startAt`/`endAt` in
   ms, `unit`, `timezone`), the metric type name for page paths (`path` vs `url`
   differs between major versions) and referrers, and the filter parameter for a
   single path.
6. Whether stats return unique visitors directly.
7. That Umami stores no raw IP address.
8. Default first-boot credentials and how to change the password via API.

## 10. Definition of done

- All slices merged in order with `task check` green; `task test:integration`
  green including the new suite.
- Dashboard verified server-side as editor, contributor and platform admin, and
  visually by the user in the browser (Claude does not type passwords).
- Stopping Umami degrades the dashboard to editorial-only and does not affect the
  public sites or `POST /public/v1/views`.
- Every doc in §8 updated; this proposal marked Built.

---

## 11. Build log — where the build deviated from this plan, and why

Recorded as it happened, so the plan above reads as intended and this section
as what is true.

| Plan said | Built | Why |
|---|---|---|
| Image tag `v3.3.1`-style | `ghcr.io/umami-software/umami:3.3.1` | The registry publishes tags without the `v`; `v3.3.1` does not exist (checked with `docker manifest inspect`). |
| `02-umami-database.sql` init script + `task analytics:db` | One-shot `umami-db` compose service, like `kratos-migrate` | Init scripts run only on an empty data directory, so the task would still be needed for every existing volume. One idempotent container covers both. |
| `CLIENT_IP_HEADER` on Umami | `ip` and `userAgent` in the `/api/send` payload | Umami 3.3.1 prefers payload values over request headers (source + probe). No Umami config needed. |
| Timestamp support unknown (§9.1) | Supported: `timestamp` (seconds) backdates the event | Verified by probe — Slice 10 can seed history through the real ingest path. |
| First-week average over articles "whose window has started" | Only articles whose first seven days are **complete** | A just-published article would pull the mean toward zero every morning. |
| `record()` returns `number` | Returns `{ total, slug, title }` | The publish check already reads the row; avoids a second query per view. |
| Readiness rule in the domain aggregate | Pure `domain/readiness.ts`, used by the aggregate, the list DTO mapper, and mirrored once in SQL | Pipeline counts and the `readiness` filter must agree; verified equal live. |
| Dev seed `--reset` via Umami's reset endpoint | Deletes and recreates the Umami website | Umami's reset stamps `reset_at` and hides every earlier event — all of a backfill. Seeded views read as zero until this was found. |
| Kong: "no change" | **Kong had to be re-rendered and restarted** | DB-less Kong reads its config only at start. It had run 4 weeks on a config without the `public-v1-views` route, so no site view had ever reached the API (0 rows in `article_views`). Now documented in `api-reference.md`. |

### §9 answers (Umami 3.3.1, probed 2026-09-12)

1. `/api/send` pageview payload: `website, hostname, url, title, referrer,
   language, screen, ip, userAgent, timestamp` — all honoured.
2. Client IP: payload `ip` wins; no header config needed.
3. User agent: payload `userAgent` wins over the header; a bot UA returns 200
   and stores nothing.
4. Auth: `POST /api/auth/login {username,password}` → `{ token, user }`;
   `Authorization: Bearer <token>`; no token → 401.
5. Endpoints: `/stats` → `{pageviews, visitors, visits, bounces, totaltime,
   comparison}`; `/pageviews?unit=day&timezone=` → `{pageviews:[{x,y}]}` with
   ONLY non-empty days, `x` = `YYYY-MM-DDT00:00:00Z` (UTC) or
   `YYYY-MM-DD 00:00:00` (other zones); `/metrics?type=path|referrer|channel` →
   `[{x,y}]`. `path=` filters stats and pageviews. Empty referrers are absent
   from `type=referrer`.
6. Unique visitors: yes, `visitors` on `/stats`.
7. No raw IP stored: `session` holds country/region/city only.
8. First boot is `admin` / `umami`; `POST /api/me/password
   {currentPassword,newPassword}` changes it (used by `analytics:provision`).

### Known, not caused by this work

Three repository specs fail while the seeded fixture `a-draft-nobody-should-see`
(technology tenant) is published — it was published in the backoffice at
09:41 on 2026-09-12. They assert that fixture stays a draft. Unpublish it or
re-seed to restore them.
