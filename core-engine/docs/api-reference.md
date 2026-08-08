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
      "draftCount": 1
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

List query: `page`, `perPage` (capped 100), `status`, `authorId`, `search`.
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

## Not built yet

Agreed shape only; see `api-conventions.md` for the route list.

```
GET                    /admin/v1/categories, /admin/v1/authors
POST                   /admin/v1/authors            invite/provision an author
GET                    /public/v1/categories[/:slug/articles]
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
