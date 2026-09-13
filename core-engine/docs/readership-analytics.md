# Readership analytics

How article views are recorded, where readership figures come from, and the
rules that keep them honest and tenant-isolated. Built 2026-09-12 from
`docs/proposals/dashboard-analytics-umami.md` (now history — this file is the
reference).

## The two stores, and which one is true

| Store | What it holds | Who reads it |
|---|---|---|
| `article_views` + `article_view_counts` (our Postgres) | One row per counted view; a running total per article | The count readers see on the sites. **Authoritative.** |
| Umami (its own `umami` database, internal-only service) | The same views plus referrer, device, browser, language, rough geo, bot filtering | The backoffice dashboard |

`article_views` is written **first**; Umami is derived. If Umami loses data, is
down, or is replaced, the raw log is intact. The two numbers can differ slightly
(Umami drops bots) — the dashboard footnote says so. Do not "reconcile" them.

## Recording a view

```
reader's browser (once per article per session, after paint)
  → site Nitro  POST /api/views        adds X-Reader-Ip, X-Reader-User-Agent
  → Kong        public-write-api       key-auth, rate limit
  → API         PublicViewsController.record
       1. ArticleViewRepository.record() — only if the article is this
          tenant's and published; returns { total, slug, title }
       2. ReadershipAnalytics.track()    — NOT awaited, 1.5 s timeout
  → Umami       POST /api/send         internal network only
```

Rules:

- **Path and title come from the article row**, never from the request body. A
  caller cannot write arbitrary URLs into a tenant's analytics.
- **Tracking never fails or slows a view.** It runs after the response is
  decided; failures are logged at `warn` with the endpoint and cause only.
- **Reader IP and user agent are passed through, never kept.** Nothing in our
  database or logs stores them. Umami keeps country/region/city and a session
  hash — no raw IP (verified on 3.3.1). The `X-Reader-*` headers are trusted only
  because the tenant key never leaves a site's server; a forged value can at
  worst skew that tenant's device/geo data.
- **Same-site referrers are dropped in the browser**, so "Direct / internal"
  means what it means in Umami's own tracker.
- Every site records views the same way (decision D4). A new site copies
  `app/composables/useArticleViews.ts` and `server/api/views.post.ts`.

## Reading: the dashboard

`GET /admin/v1/dashboard/analytics?range=7d|30d|90d&tz=<IANA>` — contract in
`api-reference.md`. Assembled by `buildDashboardAnalytics`
(`libs/article/src/application/dashboard-analytics.ts`):

- **Scope from role, never input.** Contributor → `mine` (own articles; no
  authors; visitors and sources null because they cannot be split per author
  honestly). Editor/admin → `site`.
- **Editorial figures always come from our database** — published counts,
  publishing by day, the pipeline. They are returned even when readership is not.
- **Readership degrades, never errors.** No website id → `not-connected`; Umami
  failing in any way → `unavailable` (cause logged, not sent). Both are 200.
- **Umami paths are joined to articles in our database** by `(tenant_id, slug)`.
  `/article/:slug` ↔ slug lives in one place, `domain/readership.ts`. Paths that
  are not a published article count in site totals and nowhere else.
- **Days are cut in the viewer's zone** (decision D5): the backoffice sends the
  browser's IANA zone; `domain/analytics-window.ts` computes windows with Intl
  (DST-safe). The previous window is adjacent and exactly as long as the current
  one, so a morning never looks like a decline.
- **"Views per new article"** averages only articles whose first 7 days are over.
- **Pipeline counts and `?readiness=`** follow one rule, `domain/readiness.ts`,
  mirrored once in SQL. They must stay equal; an integration test checks it.

## Tenant isolation

Inside Umami, each tenant is one *website*. `tenants.umami_website_id` is the
boundary:

- The use case reads it from the **caller's own tenant row** and passes it to
  the adapter as `ReadershipSite`. The adapter never picks a website and never
  takes one from a request.
- `tenants_umami_website_key` (partial unique) makes two tenants sharing a
  website impossible — which would merge their readership.
- The integration suite asserts a tech editor's response contains no gaming
  article ids or authors while Umami holds both tenants' data.

## The Umami adapter

`libs/article/src/infrastructure/umami-readership.analytics.ts` is the only file
that knows it is Umami. **Written against Umami 3.3.1**, the pinned image.
Verified facts (probed 2026-09-12):

| | |
|---|---|
| Ingest | `POST /api/send` `{type:'event', payload:{website, hostname, url, title, referrer, language, screen, ip, userAgent, timestamp}}`. Payload `ip`/`userAgent` win over headers. `timestamp` (seconds) backdates. A bot UA returns 200 and stores nothing. |
| Auth | `POST /api/auth/login {username,password}` → `{token}`; `Authorization: Bearer`. The adapter re-logs in once on a 401. |
| `/stats` | `{pageviews, visitors, visits, bounces, totaltime, comparison}` |
| `/pageviews?unit=day&timezone=` | `{pageviews:[{x,y}]}`, **only non-empty days**, `x` = `YYYY-MM-DDT00:00:00Z` for UTC, `YYYY-MM-DD 00:00:00` otherwise — the adapter fills gaps |
| `/metrics?type=path\|referrer` | `[{x,y}]`; empty referrers are absent (the adapter derives "Direct / internal" from the total) |
| Filters | `path=` works on stats and pageviews |

Timeouts: 2 s reads, 1.5 s tracking. Reports are cached in memory for 60 s
(single API instance on one VPS — fine). **Bumping the image means re-running
the adapter contract test** in `test/integration/dashboard-analytics.int.spec.ts`.

## Operating it

| Task | Does |
|---|---|
| `task dev` | Starts `umami-db` (creates the `umami` database, idempotent) and `umami` |
| `task analytics:provision` | One Umami website per tenant, id stored on the tenant; rotates Umami's first-boot password to `UMAMI_ADMIN_PASSWORD`. Idempotent; refuses the dev password in production. |
| `task db:seed:views` | DEV ONLY. 90 days of synthetic readership through the real ingest path, plus matching `article_views`. Refuses if views exist; `-- --reset` wipes `article_views` and **recreates** each site's Umami website (new id on the tenant). |

The unit suite's view-repository spec resets the counts of the shared-slug
fixture articles in the dev database, so after `task test` those articles'
`article_views` no longer match Umami. Harmless — the dashboard reads Umami —
but `task db:seed:views -- --reset` puts the two stores back in step.

Umami's own UI is on `127.0.0.1:${UMAMI_PORT}` in dev only, for inspecting raw
data. Editors never use it — it knows nothing of our roles or tenants.

**Never use Umami's "reset website data"** (UI or `POST /api/websites/:id/reset`)
on a site you intend to backfill: it stamps `website.reset_at` and every query
then ignores events dated before it. The data is still in the table and the
dashboard reads zero — found 2026-09-13. Recreate the website instead.

If the dashboard shows `unavailable`, check `docker logs artical-api-1 | grep
readership` for the cause, then Umami's `/api/heartbeat`.
