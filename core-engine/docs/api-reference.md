# API reference — the response contract

**This file is the contract between the backend and every frontend.** Read it
before implementing or changing any endpoint, and update it in the same change.

## Why this file exists

The frontends are separately deployed and cannot import types from
`core-engine`. There is no codegen and no shared package — decided 2026-08-08.
Instead, **this document is the source of truth**, and each frontend hand-writes
types from it.

That only works if two rules hold:

1. **Change this file in the same commit as the endpoint.** A hand-written type
   can only stay honest against a spec that is current. A stale entry here is
   worse than no entry, because it will be trusted.
2. **Update the Bruno request in `/api` too.** Bruno is how you check the
   documented shape against the running one. Docs plus an executable request is
   what substitutes for compile-time enforcement.

If this drifts often enough to be untrustworthy, that is the signal to revisit
codegen from Swagger (`@nestjs/swagger` is already wired, so the spec exists) —
not a reason to quietly stop updating it.

Conventions — envelope, pagination, error shape, status codes — live in
`api-conventions.md`. This file is shapes only.

---

## Field conventions

| | |
|---|---|
| Timestamps | ISO 8601 UTC strings on the wire. Never a local-time string. |
| Ids | UUID v7 strings. |
| Absent vs empty | `null` means "does not apply"; `[]` means "none yet". Never conflate. |
| Counts | JSON numbers. Postgres returns `count()` as a bigint that the driver hands back as a **string** — cast at the repository boundary or the UI renders quoted numbers. |

---

## `GET /admin/v1/me`

The current principal. The backoffice calls this after login to decide what to
render. **Built.**

A discriminated union on `kind`. Not one shape with optional fields — a platform
admin genuinely has no tenant, and `null` there means "does not apply", not
"unknown".

```jsonc
// kind: "author"
{
  "kind": "author",
  "id": "019fdc…",           // author id
  "username": "mara-okonkwo", // null on rows predating the profile feature
  "name": "Mara Okonkwo",
  "tenantId": "0198f000-…",
  "tenantName": "Technology Site",  // so the chrome can name the site without a 2nd request
  "role": "admin"             // admin | editor | contributor
}
```

```jsonc
// kind: "platform-admin"
{
  "kind": "platform-admin",
  "id": "019fdcce-…",         // platform admin id
  "username": "superadmin",
  "name": "Platform Owner",
  "tenantId": null,           // has no tenant, by design
  "tenantName": null,         // same
  "role": null                // has no tenant role, by design
}
```

`tenantName` is null for an author only if the tenant row vanished underneath
them — a broken FK, not a normal state. The admin chrome renders without a site
name rather than failing every page on it.

**Not returned, deliberately:** the Kratos identity id. It is an internal join
key; echoing it back puts it in browser memory, logs, and error reports for no
benefit.

`tenantId` is returned **as a display label only**. It is never accepted back as
input — every tenant-scoped query resolves the tenant server-side from the
principal.

Errors: `401` no identity header (edge misconfigured — should be unreachable),
`403` identity valid but not provisioned, or deactivated.

---

## `GET /admin/v1/dashboard`

The first screen after login. **Built.**

Also a union on `kind`, chosen by the resolved principal — the caller cannot ask
for the other shape.

```jsonc
// kind: "author"
{
  "kind": "author",
  "tenantName": "Technology Site",
  "role": "admin",
  "articles": { "published": 6, "draft": 1, "total": 7 },  // whole tenant
  "mine":     { "published": 6, "draft": 1, "total": 7 },  // this author only
  "mediaCount": 0,                                          // live rows, excludes soft-deleted
  "recent": [                                               // most recently EDITED, any status
    {
      "id": "019fdc…",
      "title": "…",
      "slug": "…",
      "status": "draft",              // draft | published
      "publishedAt": null,            // null while never published
      "updatedAt": "2026-08-08T04:12:00.000Z",
      "authorName": "Mara Okonkwo",
      "categoryName": "Reviews"       // null when uncategorised
    }
  ]
}
```

`recent` is ordered by `updated_at` descending, capped at 8. Deliberately not by
`published_at`: the question is "what has been worked on", and publish-date order
buries every draft regardless of how recently it was edited.

`articles` and `mine` are separate because they answer different questions — "how
is the site doing" versus "what have I left unfinished". A contributor needs the
second one regardless of the first.

```jsonc
// kind: "platform-admin"
{
  "kind": "platform-admin",
  "tenantCount": 2,
  "authorCount": 2,          // summed across tenants
  "tenants": [
    {
      "id": "0198f000-…",
      "name": "Gaming Site",
      "domain": "gaming-site.localhost",
      "nicheLabel": "gaming",
      "authorCount": 1,
      "publishedCount": 6,
      "draftCount": 1,
      "views30d": 1402         // null = analytics not provisioned, or unavailable
    }
  ]
}
```

**AGGREGATE COUNTS ONLY, and this is the design rather than an omission.** No
article titles, slugs, excerpts, or content. Root `CLAUDE.md` §1 gives a platform
admin no access to any tenant's content; a count answers "is this site alive and
being worked on", which is an operator's question, without exposing anything
anyone wrote.

Adding a title to this payload is a reversal of §1 and needs deciding, not a
field addition.

`views30d` is readership over the last 30 **UTC** days, from Umami — an aggregate
like the counts beside it. It is null when the site has no analytics website or
the analytics store is down; the rest of the payload is unaffected either way.

---

## `GET /admin/v1/dashboard/analytics?range=&tz=`

Readership and editorial analytics for the dashboard. **Built** (backend);
plan and rationale in `docs/proposals/dashboard-analytics-umami.md`.

| Query | |
|---|---|
| `range` | `7d` \| `30d` \| `90d`, default `30d` |
| `tz` | the **viewer's** IANA zone, default `UTC`. Decides where each day begins; stored instants are UTC regardless. An unknown zone is a **400**, never silently UTC. |

Tenant authors only — a platform admin gets **403** (their figure is `views30d`
above). **Scope is decided by role:** a contributor gets `scope: "mine"` (only
their own articles, no authors, no site-wide visitors or sources); editors and
admins get `scope: "site"`.

```jsonc
{
  "range": "30d",
  "timezone": "Asia/Phnom_Penh",
  "scope": "site",                                   // "mine" for contributors
  "current":  { "from": "2026-08-13T17:00:00.000Z", "to": "2026-09-12T10:04:00.000Z" },
  "previous": { "from": "2026-07-14T17:00:00.000Z", "to": "2026-08-13T10:04:00.000Z" },  // adjacent, EXACTLY as long

  "editorial": {                                     // always present — our own database
    "published": { "current": 3, "previous": 4 },
    "publishedByDay": [ { "date": "2026-08-14", "count": 0 } ],   // dense, local dates
    "pipeline": {                                    // drafts; blockers OVERLAP
      "ready": 2, "needsExcerpt": 1, "needsCover": 1,
      "lastPublishedAt": "2026-09-08T09:12:00.000Z"  // null if nothing published
    }
  },

  "authors": [                                       // null for contributors
    { "authorId": "…", "name": "Mara Okonkwo", "published": 2, "views": 1300 }
  ],                                                 // sorted by NAME, unranked; views null unless readership ok

  "readership": {
    "status": "ok",                                  // | "not-connected" | "unavailable" → no other keys
    "views":    { "current": 2107, "previous": 1786 },
    "visitors": { "current": 1402, "previous": 1210 },       // null in "mine"
    "firstWeekViewsPerNewArticle": 412,              // null if no article has a complete first week
    "daily": [ { "date": "2026-08-14", "views": 40 } ],       // dense
    "topArticles": [
      { "articleId": "…", "title": "…", "slug": "…", "authorName": "…",
        "categoryName": "Guides", "publishedAt": "…", "views": 612,
        "daily": [3, 5, 9] }                         // aligned to readership.daily
    ],
    "byCategory": [                                  // article views only; shares sum to exactly 1
      { "categoryId": "…", "name": "Guides", "retired": false, "views": 1160, "share": 0.55 },
      { "categoryId": null, "name": "Uncategorised", "retired": false, "views": 40, "share": 0.019 }
    ],
    "sources": [ { "source": "facebook.com", "views": 900 },  // null in "mine"
                 { "source": "Direct / internal", "views": 310 } ]
  }
}
```

Rules worth knowing:

- **`readership.status` is not an error channel.** `not-connected` (no analytics
  website — `task analytics:provision`) and `unavailable` (Umami down/slow) both
  return **200** with `editorial` intact. Render the editorial half regardless.
- **Views are Umami's**: once per article per browser session, bot-filtered.
  They can differ slightly from the counter the sites show readers, which reads
  `article_view_counts`.
- **Paths are joined to articles in our database.** Views of pages that are not
  a published article (home, category pages, deleted articles) count in
  `views` but never appear in `topArticles`, `byCategory` or `authors`.
- **`firstWeekViewsPerNewArticle`** averages only articles whose first seven
  days are over — a just-published article would drag it toward zero.
- **Sources** collapse hostnames (`l.facebook.com`, `m.facebook.com` →
  `facebook.com`); `Direct / internal` is everything without an external
  referrer, same-site navigation included.
- Umami reports are cached for 60 s, so a view appears within a minute.

---

## Admin articles

**Built.** `GET/POST /admin/v1/articles`, `GET/PATCH/DELETE /admin/v1/articles/:id`,
`POST /admin/v1/articles/:id/{publish,unpublish}`.

Roles: `contributor` may list, read, create and edit. **`editor` and above** may
publish, unpublish, and delete — publishing is what a reader sees, so it is not a
contributor's call.

### The article shape

```jsonc
{
  "id": "019fdc…",
  "title": "The repairable phone is back",
  "slug": "the-repairable-phone-is-back",  // derived from the title if omitted
  "status": "draft",                        // draft | published
  "excerpt": null,                          // feeds og:description
  "coverImage": null,                       // feeds og:image, ~1200×630
  "publishedAt": null,                      // ISO 8601 UTC; null while never published
  "updatedAt": "2026-08-09T01:12:00.000Z",
  "authorId": "019fdc…",
  "authorName": "Mara Okonkwo",
  "categoryId": null,
  "categoryName": null,                     // joined on list; null on a single read
  "missingToPublish": ["excerpt", "coverImage"]
}
```

`GET /admin/v1/articles/:id` adds `content` — TipTap block JSON, not HTML.

**`missingToPublish` is the contract that lets the UI show the requirement while
writing** rather than as a 422 at the moment someone hits publish. It is computed
by the aggregate from the same fields `publish()` enforces, so the hint can never
promise something the API refuses. Empty array means ready.

List query: `page`, `perPage` (capped 100), `status`, `authorId`, `categoryId`, `readiness`, `search`.
`readiness` (`ready` | `needs-excerpt` | `needs-cover`) lists DRAFTS by what still
blocks publishing; blockers overlap, and each total equals the matching
dashboard pipeline number — both come from one rule in `domain/readiness.ts`.
`categoryId` is ANDed onto the tenant predicate like every filter, so another
tenant's id simply matches nothing.
Response is the standard `{ data, meta }` envelope, ordered by `updatedAt` desc.

### Rules worth knowing before calling it

| | |
|---|---|
| **Authorship** | Taken from the session. `authorId` in a create body is rejected outright — a contributor must not be able to publish under someone else's byline. |
| **Status** | Not a writable field. Transitions are verbs on sub-resources so their guards cannot be bypassed by a generic PATCH. |
| **Slugs** | Unique **per tenant**, never globally — two sites may both publish `/best-laptops-2026`. |
| **Published slugs are locked** | 409 `ARTICLE_SLUG_LOCKED`. The slug is a live URL already shared, indexed, and cached in ISR pages that only revalidate on publish. Unpublish first. |
| **Publishing is idempotent** | Re-publishing does not move `publishedAt`, and unpublishing does not clear it — it is the canonical *first* publication date. |
| **Cross-tenant** | **404, never 403.** A 403 confirms the article exists. |
| **categoryId** | Verified against the caller's tenant on create, and on update **only when it changes**. Choosing a foreign or retired category is **404 `CATEGORY_NOT_FOUND`**; re-sending the article's current category is accepted even if it has since been retired. |

### Why `categoryId` is checked in the application, not by the database

The foreign key on `articles.category_id` references `categories.id` and carries
no tenant predicate, so Postgres will happily store **another tenant's** category
on an article. Confirmed by probe before the check existed: a technology article
accepted a gaming category and the request returned 200.

The repository lookup is tenant-scoped and excludes soft-deleted rows, so the
same check also stops an article being *newly* filed under a retired section.

It runs on update only when `categoryId` changes. It used to run on every PATCH,
and the editor re-sends the current category on save — so an article whose
section had been retired could not be saved at all, not even to fix a typo
(reproduced before the fix). The backoffice now also omits an unchanged
`categoryId`; the API does not rely on that.

### Error codes

| Code | Status | Means |
|---|---|---|
| `ARTICLE_MISSING_EXCERPT` | 422 | Cannot publish; both fields feed the share preview |
| `ARTICLE_MISSING_COVER_IMAGE` | 422 | Same |
| `ARTICLE_EMPTY_TITLE` | 422 | Title was blank or whitespace |
| `ARTICLE_UNSLUGGABLE_TITLE` | 422 | Title is punctuation-only and produces no URL |
| `ARTICLE_DUPLICATE_SLUG` | 409 | Slug already used **on this site** |
| `ARTICLE_SLUG_LOCKED` | 409 | Slug change attempted on a published article |
| `ARTICLE_NOT_FOUND` | 404 | Missing, or another tenant's |

---

## `GET /public/v1/articles`

Published articles for the calling tenant, paginated. **Built.**

Tenancy comes from `X-Tenant-Key` → Kong `key-auth` → `X-Consumer-Custom-ID`.
Never from a query parameter.

```jsonc
{
  "data": [
    {
      "id": "019fdc…",
      "title": "…",
      "slug": "…",
      "excerpt": "…",              // never empty — publishing requires it
      "coverImage": "https://…",   // absolute, public, no expiry — this is og:image
      "publishedAt": "2026-08-01T09:00:00.000Z",
      "categorySlug": "reviews",   // null when uncategorised
      "authorName": "Mara Okonkwo",
      "authorUsername": "mara-okonkwo", // null → byline renders unlinked
      "authorAvatarUrl": null           // null is the COMMON case; render a fallback
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 7 }
}
```

Query: `page`, `perPage` (capped 100), `categorySlug`, `authorUsername`.

---

## `GET /public/v1/articles/:slug`

One published article. **Built.** Everything from the list item, plus:

```jsonc
{
  "content": { "type": "doc", "content": [] },  // TipTap block JSON, NOT html
  "author": {                                    // null when the author has no username
    "username": "mara-okonkwo",
    "name": "Mara Okonkwo",
    "quote": "…",
    "email": null,      // null unless contact_public — already redacted server-side
    "telegram": null,   // same
    "avatarUrl": null
  }
}
```

`email` and `telegram` arrive **already redacted** by `toPublicProfile` according
to the author's `contact_public` opt-in. Never re-derive that rule in a frontend,
and never add a raw contact field to a public DTO.

A slug belonging to another tenant returns **404, not 403** — a 403 would confirm
the resource exists. `tenant-isolation.md`.

---

## `GET /public/v1/authors/:username`

An author's profile plus their published articles. **Built.** Usernames are
normalised (trim + lowercase) before lookup, so `/author/Jane` and `/author/jane`
resolve to one page rather than one 404.

---

## `POST /public/v1/views`

Records that a published article was read. Sites call it from their own Nitro
route (the tenant key never reaches a browser), once per article per browser
session.

```jsonc
// request
{ "articleId": "019fd634-…",
  "referrer": "https://l.facebook.com/…",   // optional; omit for same-site navigation
  "language": "en-GB",                      // optional, ≤35
  "screen": "1440x900" }                    // optional, /^\d{2,5}x\d{2,5}$/
// response
{ "total": 42 }
```

404 for an unknown, unpublished or other-tenant article — indistinguishable on
purpose. After the view is counted in `article_views`, it is forwarded to Umami
fire-and-forget; a dead Umami changes neither the response nor its latency
beyond nothing. The page path and title sent to Umami come from the article
row, never from this body. Optional `X-Reader-Ip` / `X-Reader-User-Agent`
headers (set by the site's server) feed geo, device and bot detection; neither
is stored or logged by the API.

**Gateway note:** this is a separate Kong service (`public-write-api`). Kong is
DB-less and reads its config only at start — after changing
`infrastructure/kong/kong.template.yml`, re-render and restart Kong, or the
route silently does not exist (found 2026-09-12: this route had been missing
for weeks, so no site view was ever recorded).

## Media

`POST /admin/v1/media/presign`, `POST /admin/v1/media/:id/confirm`,
`GET /admin/v1/media`, `GET /admin/v1/media/:id`, `DELETE /admin/v1/media/:id`.
**Built.** The flow itself is in `media-and-uploads.md` — uploads go browser →
MinIO directly and never through a frontend server route.

### `status` has FOUR values, not three

```
pending → processing → ready
                    ↘ failed
```

Worth stating plainly because omitting `processing` is the easy mistake and it
breaks polling in a way that looks like success: a client that waits only while
`pending` stops the instant the worker claims the row, and reports a
half-processed image as finished. The Swagger enum itself had this bug.

`url` is valid the whole time — it points at the original, which exists from
confirm onward. `variants` (`og`, `card`, `thumb`, `avatar`) only populate on
`ready`, so render the original until then rather than waiting.

---

## Categories

Tenant taxonomy — and, directly, each site's navigation. Reads are
contributor-and-above (an author needs the picker); writes are
**editor-and-above**, because a slug is a public section URL and the order is
the nav.

### The category shape

```jsonc
{
  "id": "019fdc…",
  "name": "Reviews",
  "slug": "reviews",            // URL segment: /category/:slug
  "description": null,          // ≤300 chars; section page + meta description
  "position": 2,                // ascending nav order
  "articleCount": 2,            // ALL statuses, drafts included
  "retiredAt": null             // ISO 8601 UTC when retired
}
```

`articleCount` deliberately spans every status: an editor deciding whether to
retire a section needs to know about drafts filed under it, not only what
readers can see. **That is also why it never appears on the public shape.**

### `GET /admin/v1/categories[?include=retired]`

`{ data: Category[] }`. Live categories in nav order. With `include=retired`,
retired ones follow — the categories page asks for them, the article picker does
not. A retired row's `position` is stale; ignore it.

### `POST /admin/v1/categories`

```jsonc
{ "name": "Hardware Reviews", "slug": "hardware", "description": "…" }   // slug, description optional
```

Returns the category. Omit `slug` and it is derived from the name by the same
`slugify` used for articles — the rule lives in `@core/shared` precisely so the
two cannot drift. A new category lands **last** in the nav; appearing first would
reshuffle a live site as a side effect of creating something.

### `PATCH /admin/v1/categories/:id`

Any of `name`, `slug`, `description` (`null` clears it). Returns the category.
Live categories only — restore a retired one first.

**A rename does not move the slug.** The URL only changes when `slug` is sent.

**A slug change leaves a redirect.** The old slug is written to
`category_slug_redirects` in the same transaction, pointing at the category
(not at the new slug), so a section renamed twice sends both old slugs straight
to the current one. A live category always beats a redirect: creating or
restoring a category with a redirected slug removes that redirect.

### `DELETE /admin/v1/categories/:id`

```jsonc
{ "deleted": true }
```

**Soft delete, and it is not blocked by usage.** Articles keep their
`category_id`, and the admin keeps showing the label. On the public surface the
section disappears: it leaves the nav, `/category/:slug` 404s, and its articles'
`categorySlug` becomes `null` so no card links to a dead section. The slug is
immediately reusable — the unique index is partial (`WHERE deleted_at IS NULL`).

### `POST /admin/v1/categories/:id/restore`

Returns the category, live again and placed **last** in the nav. Its articles
never lost their `category_id`, so they reappear under it as they were.
Idempotent — restoring a live category returns it unchanged.

409 `CATEGORY_SLUG_TAKEN` if a live category took the slug while this one was
retired. Change that one's slug first.

### `POST /admin/v1/categories/reorder`

```jsonc
{ "ids": ["019fdc…", "019fdd…", "…"] }   // EVERY live id, in the new order
```

Returns `{ data }` — the live list in its new order. Anything other than exactly
the tenant's live ids, each once, is **409 `CATEGORY_ORDER_STALE`** with
`details: { missing, unknown, duplicated }`. Refused rather than guessed at: the
usual cause is a colleague creating or retiring a category since the page
loaded, and a partial order would leave two sections sharing a position. A
retired or foreign id counts as `unknown`.

### `GET /public/v1/categories`

```jsonc
{ "data": [ { "name": "Reviews", "slug": "reviews", "description": null } ] }
```

Live only, **in nav order**. A separate shape, not the admin one with fields
stripped — no ids, no `position`, and no `articleCount`, which counts drafts.

### `GET /public/v1/categories/:slug`

What `/category/:slug` on a site should do:

```jsonc
{ "kind": "category", "name": "Reviews", "slug": "reviews", "description": null }
{ "kind": "redirect", "slug": "kit-and-gear" }   // renamed — answer with a 301 there
```

404 `CATEGORY_NOT_FOUND` for no such section, a retired one, or a redirect
pointing at a retired one. The slug is lowercased before lookup, so
`/category/Reviews` resolves (and the sites 301 it to the canonical case).

The redirect is reported in the **body**, not as an HTTP 301. The sites call
this server-side with `$fetch`, which follows redirects silently — a 301 would
hand the page the new category with no sign it had moved, and it could never
redirect the reader's browser.

### Caching

Kong caches public reads for 60s; each site caches the nav list and each slug
resolution in Nitro for 300s; section pages are ISR for 600s. An edit therefore
takes up to ~10 minutes to show on a section page. Fine for navigation; do not
build a flow where an editor expects to confirm a change visually. The
categories page says so.

### Error codes

| Code | Status | When |
|---|---|---|
| `CATEGORY_NAME_EMPTY` | 422 | name blank or whitespace |
| `CATEGORY_NAME_UNSLUGGABLE` | 422 | nothing sluggable in it — would yield `/category/` |
| `CATEGORY_SLUG_TAKEN` | 409 | another live category in this tenant owns that slug (create, slug change, restore) |
| `CATEGORY_ORDER_STALE` | 409 | reorder body is not exactly the live ids, each once |
| `CATEGORY_NOT_FOUND` | 404 | no such id **or** it belongs to another tenant; on the public resolve, no live section |

---

## Not built yet

Agreed shape only; see `api-conventions.md` for the route list.

```
GET                    /admin/v1/authors
POST                   /admin/v1/authors            invite/provision an author
GET                    /public/v1/categories/:slug/articles
GET                    /public/v1/preview/:id
```

State transitions are **verbs on sub-resources**, never `PATCH { status }` — that
keeps each transition's guards explicit and stops a generic PATCH from becoming a
way around the aggregate.

---

## Related

- `api-conventions.md` — envelope, errors, status codes, the public/admin split
- `auth-request-flow.md` — how identity arrives and becomes a principal
- `tenant-isolation.md` — why cross-tenant reads are 404
- `article-status-lifecycle.md` — what each transition may do
- `/api` — the Bruno collection, which is how you check this file is still true
