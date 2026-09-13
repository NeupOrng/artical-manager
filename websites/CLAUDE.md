# websites/CLAUDE.md — Public tenant sites

Domain knowledge shared by every public tenant website. Per-site specifics live in
each site's own `CLAUDE.md`.

## What these are

One Nuxt (Vue) SSR project per tenant. Each is an independently branded, independently
domained content site reading from the same backend. They are **thin**: fetch and
render. No business logic, no tenant-isolation logic, no scheduling logic — that all
lives in `/core-engine` and must not be reimplemented here.

| Site | Domain | Niche |
|---|---|---|
| `technology-site` | TBD | Technology |
| `gaming-site` | TBD | Gaming |

Adding a tenant = new project here + a `Tenant` row + a domain + a tenant API key.
Nothing else.

## Running locally

`task dev` from the repo root starts everything — backend stack plus both sites
as containers, via `infrastructure/compose/docker-compose.sites.yml`. That
override is **development only** and is never deployed.

## Deployment

Managed host (Vercel-style), **not** the VPS. SSR with ISR. This is deliberate: read
traffic is the only thing that scales on a content site, and the edge absorbs it so
the backend stays low-traffic.

A consequence worth protecting: with ISR + stale-while-revalidate, **these sites keep
serving during a backend outage.** Don't introduce a render-blocking call to the API
on a hot path that would break that.

## Open Graph — the core product requirement

Every article, category, and home page must **server-render**:

| Tag | Source |
|---|---|
| `og:title` | article title (or site name on home) |
| `og:description` | `excerpt` — mandatory, never generated from body text |
| `og:image` | `cover_image` — **absolute** URL, ~1200×630 |
| `og:url` | canonical absolute URL |
| `og:site_name` | tenant name |
| `og:type` | `article` on article pages, `website` elsewhere |
| `article:published_time` | `published_at`, ISO 8601 |
| `twitter:card` | `summary_large_image` |

Non-negotiable details:

- **Server-rendered.** Social crawlers do not execute JavaScript. Tags injected
  client-side are invisible to them. This is the single most common way this
  requirement gets silently broken.
- **`og:image` must be absolute and publicly fetchable**, never relative, never a
  presigned URL with an expiry.
- Verify with Facebook's Sharing Debugger on a real deployed URL before calling any
  article-rendering work done. Facebook caches aggressively — re-scrape after fixes.

`excerpt` and `cover_image` are mandatory on the article model precisely so these
tags can never be empty.

## Data access

- Read from `/public/v1/*` only. That surface returns published content exclusively.
- Each site holds its own **tenant API key** in env. Kong maps it to a consumer for
  per-tenant rate limiting; the API resolves the tenant from it.
- Never send a `tenant` query parameter — tenancy is derived from the key, and a
  client-supplied tenant is a cross-tenant read waiting to happen.
- SSR fetches run server-side against the API over the public internet. Budget for
  that latency; co-locate the host region with the VPS where possible.

## Revalidation contract

When the worker publishes or unpublishes an article, it calls each site's
revalidation endpoint:

```
POST /api/revalidate
{ "paths": ["/article/my-slug", "/category/laptops", "/"] }
Header: X-Revalidate-Secret: <shared secret, per site>
```

- The secret lives in the site's env and in `/infrastructure` config. Reject
  mismatches with 401 and log them.
- The endpoint must be idempotent and must not be reachable without the secret.
- Revalidation failures must not be treated as publish failures — the article is
  already live in the database.

## View recording

Every site records views the same way (both do, as of 2026-09-12): the article
page calls `useRecordArticleView()` after mount — never during SSR, the page is
ISR — at most once per article per browser session. The browser posts to the
site's own `server/api/views.post.ts`, which adds the reader's IP and user agent
as `X-Reader-*` headers and forwards to `POST /public/v1/views` with the tenant
key. The API counts it, then forwards it to Umami for the backoffice dashboard.

- Sent from the browser: `articleId`, and best-effort `referrer` (external only —
  same-site navigation is dropped), `language`, `screen`. Never the URL or title;
  the API derives those from the article.
- **No analytics script on the sites**, by decision: nothing ad-blockable, nothing
  extra on ISR pages, and Umami stays off the internet.
- Failures are swallowed. A missed view must never affect reading.

A new site copies `app/composables/useArticleViews.ts` and
`server/api/views.post.ts` from technology-site. Detail:
`../core-engine/docs/readership-analytics.md`.

## Preview

`/_preview/:id` renders any status, gated by a short-lived signed token minted by the
admin. It uses the **same components** as the live article page — that's the whole
point, so preview cannot drift from published output. Never build a separate preview
renderer.

Preview pages must be `noindex` and must never be ISR-cached.

## Styling — Tailwind, per-site themes

**Every site styles with Tailwind CSS.** No exceptions, no second styling system,
no per-component CSS files competing with it.

Tailwind v4 is CSS-first: tokens live in each site's
`app/assets/css/main.css` under `@theme`, wired through `@tailwindcss/vite` in
`nuxt.config.ts`. There is no `tailwind.config.js`.

The constraint that matters here:

- **Each site owns its own theme file. There is no shared preset, no shared
  theme package, and no shared component library.** Tailwind's defaults are a
  strong homogenising force — two sites on stock Tailwind will look like
  siblings regardless of their content, which directly violates the rule that
  the sites must read as unrelated publications. Diverge on palette, type
  pairing, spacing rhythm, and layout logic, not just hue.
- Prefer semantic tokens (`bg-surface`, `text-accent`) over raw palette values,
  so a rebrand is a change to one `@theme` block.
- v4 **tree-shakes `@theme` variables that no utility references**. If a token
  seems to vanish from the compiled CSS, that's why — it isn't a build failure.

The current theme values in both sites are **placeholders**. Real palettes and
type pairings come from the design work once each site's identity is settled —
see the `TBD` fields in each site's `CLAUDE.md`, and the `frontend-design` skill.

## Navigation

Category nav comes from `/public/v1/categories`, cached in Nitro for 300s,
in the order editors set in the backoffice.

It used to be **derived from published articles** because no endpoint existed.
That could only ever show sections which already had something published, so a
newly created category stayed invisible and a renamed one kept its old label.
Don't reintroduce that shortcut.

## Section pages

`/category/:slug` resolves the slug first, through `server/api/categories/[slug]`
(→ `/public/v1/categories/:slug`, cached 300s):

| API says | Page does |
|---|---|
| `kind: category` | renders, heading = the category's real **name**, meta description = its `description` or a generic line |
| `kind: redirect` | **301** to `/category/<slug>` — the section was renamed; also canonicalises case |
| 404 | **404** via `createError` — never an empty page with a 200 |

Before this, any slug rendered as an empty section with a 200 (a soft 404 search
engines index) titled from the slug. If the resolve call fails for another reason
(API down) the page still renders from the slug — don't turn that into a 500.

## Rules

- **No business logic.** If the site needs to know whether something is publishable,
  that's the wrong question — it only ever receives published content.
- **No direct database access.** Ever. The API is the only door.
- **No draft or scheduled content reachable**, including via a crafted URL. The
  public API cannot return it, and that's the enforcement — don't add a client-side
  filter and call it done.
- **No secrets in client-side code.** The tenant API key and revalidation secret are
  server-only (Nitro), never in `public` runtime config.
- Keep the two sites' shared conventions in sync, but **do not build a shared
  component library** until there's a real second case for a given component.
  Divergent branding is the point.

## Related

- `technology-site/CLAUDE.md`, `gaming-site/CLAUDE.md` — per-site domain knowledge
- `../core-engine/docs/api-conventions.md` — the public API surface
- `../core-engine/docs/media-and-uploads.md` — why `og:image` URLs look as they do
