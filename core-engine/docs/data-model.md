# Data model — tables and relations

What the tables are, how they relate, and why each relationship is shaped the way
it is. Verified against the live database, not only against the Drizzle files.

This is the **relational picture**, which no single schema file carries: each file
explains itself well, but nothing shows how the nine tables fit together or what
happens to a row when its parent disappears.

Adjacent docs, so you know when to leave:

- `database-and-migrations.md` — conventions and the migration *process*
- `tenant-isolation.md` — the query rules these constraints back up
- `article-status-lifecycle.md`, `media-and-uploads.md`, `readership-analytics.md`
  — the behaviour behind individual tables
- `api-reference.md` — the response shapes, which are **not** these rows

---

## The map

```
                            ┌──────────────────┐
                            │  platform_admins │   NOT tenant-scoped.
                            │  (operators)     │   No FK to anything.
                            └──────────────────┘
                                     ╌╌╌ no relation, on purpose (§ Two kinds of principal)

  ┌─────────┐
  │ tenants │  the root. The ONLY table without tenant_id — it is the tenant.
  └────┬────┘
       │ every arrow below is "…and carries tenant_id"
       │
       ├──────────────┬───────────────┬──────────────┬─────────────────┐
       │              │               │              │                 │
       ▼              ▼               ▼              ▼                 ▼
  ┌─────────┐   ┌────────────┐   ┌─────────┐   ┌──────────────────┐  ┌───────────────┐
  │ authors │   │ categories │   │  media  │   │ category_slug_   │  │ article_views │
  └────┬────┘   └─────┬──────┘   └────┬────┘   │ redirects        │  │ (event log)   │
       │              │               │        └────────┬─────────┘  └───────┬───────┘
       │              │               │                 │                    │
       │              │               └──► authors.avatar_media_id           │
       │              │                    (SET NULL)                        │
       │              │                                 │                    │
       │              └─────────────────────────────────┘                    │
       │                  redirects.category_id (CASCADE)                     │
       │                                                                      │
       └──────────┐        ┌───────────────────────────────────────────────────┘
                  ▼        ▼
              ┌──────────────┐        ┌─────────────────────┐
              │   articles   │───────►│ article_view_counts │  1:1 running total
              └──────────────┘        └─────────────────────┘  PK (tenant_id, article_id)
                 ▲        ▲
                 │        └── category_id  (nullable, SET NULL)
                 └─────────── author_id    (required, RESTRICT)
```

---

## The spine: one tenant, everything else beneath it

Every table except `tenants` and `platform_admins` carries `tenant_id`, and it is
`NOT NULL` on all of them. That is not redundancy next to the foreign keys — it is
what lets every repository method take a required `TenantId` and every query say
`eq(table.tenantId, tenantId)` with no null branch to forget.

`articles` carries `tenant_id` even though it could be reached through
`author_id → authors.tenant_id`. Denormalised deliberately: the alternative makes
the isolation predicate a join rather than a column comparison, and the day
someone writes a query without that join is the day the isolation breaks silently.

---

## Two kinds of principal

`authors` and `platform_admins` are **separate tables with no relation between
them**, and that is the single most consequential modelling decision here.

The obvious alternative — a `super_admin` role on `authors` with a nullable
`tenant_id` — was rejected because `authors.tenant_id` being `NOT NULL` is the
thing that makes tenant scoping mechanical. Make it nullable and a null reaches a
`WHERE tenant_id = …`, which matches nothing, so a platform admin **silently sees
an empty list** instead of an error. That reads as "no articles yet" and is very
hard to spot.

The consequence is intended: a platform admin has **no access to any tenant's
content at all**. There is no tenant id to pass to a tenant-scoped repository.
Reaching in would need a deliberate new code path, not an `if` in a guard.

Both tables hold a `kratos_identity_id`, each unique within its own table. One
identity should exist in exactly one of them, but the database cannot express a
constraint across two tables — so `PrincipalGuard` resolves `authors` first and
treats a hit in both as a misconfiguration rather than silently choosing.

---

## Tables

### `tenants`

The root. `domain` is **globally** unique — unlike almost everything else here,
because a hostname genuinely is global.

`umami_website_id` is the tenant boundary inside the analytics service, set by
`task analytics:provision` and never from a request. Its unique index is
**partial** (`WHERE umami_website_id IS NOT NULL`) so any number of tenants may be
unprovisioned at once, while two tenants can never share one website and merge
their readership.

`fb_page_id` / `fb_page_access_token` are reserved for Phase 2 and unused. Leave
them; they exist so enabling Facebook automation is additive rather than a
migration against live data.

### `platform_admins`

The operators who create tenants. **No `tenant_id`, no `role`, and no foreign key
to anything** — see [Two kinds of principal](#two-kinds-of-principal) for why this
is a separate table rather than a role on `authors`.

`username` is globally unique here (there is no tenant to scope it by), unlike
`authors.username` which is unique per tenant.

`is_active` is a soft deactivation. Deleting the row would orphan the Kratos
identity, which could still authenticate at the edge and get a confusing 403;
flipping the flag gives the API something explicit to refuse on. It is checked on
every request — the reason the principal is resolved per request rather than
trusted from a token claim is that this takes effect immediately.

### `authors`

Belongs to exactly one tenant — cross-tenant authorship is out of scope.

**No password column, ever.** Kratos owns credentials; this row holds only
`kratos_identity_id`. `username` is the identity handle and the public
`/author/:username` segment; `email` is **contact information**, publishable and
not a credential.

| Column | Note |
|---|---|
| `username` | **Still nullable** — see [Known gaps](#known-gaps) |
| `contact_public` | Gates `email` + `telegram` publicly. Defaults **false** |
| `telegram` | Free text by decision — may be a handle *or* a phone number, so nothing may build a `t.me` link from it |
| `deactivated_at` | Timestamp, not a boolean: "when did they lose access" is the question asked afterwards |
| `last_seen_at` | Written at most hourly (hot path). Null distinguishes "invited, never accepted" from "active" without asking Kratos |
| `avatar_media_id` | → `media`, `SET NULL`. Usually null |

`authors_tenant_username_key` is `(tenant_id, username)` — tenant-leading, because
two tenants may each legitimately have an `editor`.

### `categories`

Tenant-scoped taxonomy; the two sites share nothing.

`position` is the manual nav order and is `NOT NULL` **with no database default**,
deliberately — a default of `0` would let a caller omit the column and silently
file every new category at the top of the nav. The repository supplies the next
free slot.

`deleted_at` is soft delete ("retire"). The unique index is therefore **partial**:

```sql
UNIQUE (tenant_id, slug) WHERE deleted_at IS NULL
```

Without the partial clause a retired category would reserve its slug forever, so
retiring `reviews` and recreating it would fail with a constraint error the user
cannot explain or resolve.

### `category_slug_redirects`

Old `/category/:slug` values, so a changed slug 301s instead of 404ing.

It stores **`old_slug → category_id`, not `old_slug → new_slug`**. A category
renamed twice (a → b → c) then needs no chain-following: both `a` and `b` resolve
to the category, whose *current* slug is `c`. A slug-to-slug table would need a
chain walk, and a cycle (a → b → a) would loop forever.

### `articles`

| Relation | Rule | Why |
|---|---|---|
| `author_id` | **required**, `RESTRICT` | Every article has a byline. Deleting an author who wrote something is refused — the byline is history |
| `category_id` | **nullable**, `SET NULL` | An article may be unfiled |
| `tenant_id` | required, `CASCADE` | Removing a tenant removes its content |

`excerpt` and `cover_image` are nullable in the database but **mandatory to
publish** — a draft legitimately lacks them, and the Article aggregate enforces
the transition. The database cannot express "required only in one state" without
a check constraint that would block drafts from ever being saved.

`slug` is unique **per tenant**. Both sites may publish `/best-laptops-2026`; a
global unique here would be a correctness bug, letting one tenant's publishing
block another's.

`content` is TipTap block JSON, not HTML — the sites render from the JSON.

### `media`

Rows are created **only after** the object is confirmed present in MinIO. Creating
one at presign time leaves rows pointing at nothing when an upload is abandoned,
which breaks `og:image` on a live article.

The `status` enum has **four** values, and `processing` exists because this table
*is* the work queue — there is no message broker. Claiming is an atomic
`UPDATE … FOR UPDATE SKIP LOCKED`, so two workers never take the same row.

`variants` is JSONB keyed by variant name (`og`, `card`, `thumb`, `avatar`).
Empty until `status = ready`; `url` points at the original and is valid from the
moment the row exists, so nothing ever blocks on processing.

### `article_views` and `article_view_counts`

Two tables, and neither is a column on `articles`.

`article_views` is the **append-only event log** — the part that cannot be
reconstructed later, which is why it is recorded from day one. Every future
question ("popular this month", per-day charts) is answerable from these rows and
from nothing else.

`article_view_counts` is the running total the public site displays: one row per
article, so rendering a count is a point lookup rather than an aggregate. It is
**rebuildable from the log at any time**, which is what makes it safe to treat as
a cache rather than as truth. Its primary key is `(tenant_id, article_id)` — the
article id alone would be unique in practice, but the composite makes an unscoped
lookup impossible rather than merely discouraged.

Why not `articles.view_count`: the Article aggregate owns editorial state and
enforces transitions on it. A counter incremented by anonymous readers is not
editorial state, and putting it there would mean every view either loaded and
saved an aggregate or quietly bypassed it.

---

## Delete behaviour, all of it

| Child | Parent | On delete | Reasoning |
|---|---|---|---|
| `authors.tenant_id` | `tenants` | **RESTRICT** | Deleting a tenant with authors should be a deliberate act, not a cascade |
| `articles.tenant_id` | `tenants` | CASCADE | |
| `categories.tenant_id` | `tenants` | CASCADE | |
| `media.tenant_id` | `tenants` | CASCADE | |
| `article_views.tenant_id` | `tenants` | CASCADE | |
| `article_view_counts.tenant_id` | `tenants` | CASCADE | |
| `category_slug_redirects.tenant_id` | `tenants` | CASCADE | |
| `articles.author_id` | `authors` | **RESTRICT** | The byline is history; deactivate instead |
| `articles.category_id` | `categories` | SET NULL | An article may be unfiled |
| `authors.avatar_media_id` | `media` | SET NULL | Removing an image must not remove the person |
| `article_views.article_id` | `articles` | CASCADE | |
| `article_view_counts.article_id` | `articles` | CASCADE | |
| `category_slug_redirects.category_id` | `categories` | CASCADE | Only fires on tenant removal — categories are soft-deleted in the app |

Note the asymmetry: `tenants → authors` is RESTRICT while every other tenant child
cascades. Removing a tenant is meant to be blocked until its people are dealt with
explicitly.

---

## Patterns worth recognising

**Tenant-leading keys.** Every unique constraint and almost every index starts
with `tenant_id`. The exception is `article_views_occurred_idx`, which is
deliberately *not* tenant-leading because retention sweeps delete by age across
all tenants — it is the only query in the system that is legitimately global.

**Partial uniques for soft delete.** Two places use `WHERE … IS NULL/NOT NULL`:
`categories_tenant_slug_key` and `tenants_umami_website_key`. Both exist so a
nullable or retired row does not hold a name hostage.

**Soft delete, not hard delete**, in three places — and for three different
reasons:

| Table | Column | Why the row survives |
|---|---|---|
| `categories` | `deleted_at` | Articles already filed keep their section label on pages that are published and cached |
| `media` | `deleted_at` | Objects outlive rows; a reaper handles orphans deliberately |
| `authors` | `deactivated_at` | Articles reference the row and the byline is history |

**Timestamps are `timestamptz`, always UTC.** Never `timestamp` without a zone.

**IDs are UUID v7**, generated in the application layer rather than by the
database — sortable by creation time, and deterministic in tests.

---

## What is deliberately not modelled

- **No `article_categories` join table.** One category per article, by decision.
- **No scheduled-publish state.** Publishing is immediate; there is no
  future-dated status and no `scheduled_at`.
- **No queue tables.** Background work is polled from Postgres — `media.status` is
  the work list.
- **No `view_count` on `articles`.** See above.
- **No cross-table uniqueness on `kratos_identity_id`.** Enforced in the guard.

---

## Known gaps

**`authors.username` is still nullable.** The schema comment says it was
"backfilled, then made NOT NULL in a follow-up migration" — that follow-up has not
happened. Verified against the live database on 2026-09-28.

It matters more than it looks: `authors_tenant_username_key` is a plain unique on
`(tenant_id, username)`, and Postgres allows **multiple NULLs** in a unique index.
So rows without a username are neither constrained nor reachable at
`/author/:username`, and `toPublicProfile` returns null for them. Closing it is
one migration once every row is backfilled.

---

## Keeping this file honest

It describes **applied** state. When you change the schema, update it in the same
change — the same rule `api-reference.md` carries, for the same reason: a
reference that lags is worse than none, because people stop checking it against
reality.

To re-derive the facts here:

```bash
task db:psql
\d+ articles          -- one table, with indexes and FKs
\di                   -- every index
```
