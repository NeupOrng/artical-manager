# Database & migrations

Read before changing the schema. Schema lives in `libs/database/src/schema/`,
migrations in `libs/database/src/migrations/`.

## Conventions

- **Every content table carries `tenant_id`** — `authors`, `articles`, `categories`,
  `media`. `tenants` is the only exception.
- Primary keys are UUID v7 (sortable by creation time), generated in the application
  layer, not by the database. Deterministic ids make tests and job payloads simpler.
- `snake_case` columns, plural table names.
- Timestamps are `timestamptz`, always UTC. Never `timestamp` without a zone — the
  scheduler depends on unambiguous instants.
- Every table has `created_at` and `updated_at`.

## Indexes and constraints lead with tenant_id

```sql
UNIQUE (tenant_id, slug)                        -- NOT UNIQUE (slug)
INDEX  (tenant_id, status, published_at DESC)   -- the public listing query
INDEX  (tenant_id, category_id, published_at DESC)
INDEX  (tenant_id, status)                      -- the media sweep's claim scan
```

A global `UNIQUE (slug)` would let one tenant's publishing block another's — it's a
correctness bug, not just a modelling preference. Slug collisions across tenants are
expected and fine.

## Migrations

- Generated with `drizzle-kit`, then **read before committing**. Generated SQL is a
  draft; check it for accidental drops or rewrites of large tables.
- Committed to git. Never edited after being applied to any shared environment —
  write a new migration instead.
- Applied by an explicit deploy step, not automatically on API boot. Two app
  containers starting concurrently must not race to migrate.

### Additive-first rule

Adding a non-nullable column to a populated table locks and fails. Split it:

1. add the column nullable, with a default if appropriate
2. backfill
3. add the `NOT NULL` constraint in a later migration

The same applies to renames — add, dual-write, migrate reads, drop. Given the public
sites may be serving ISR pages built against the previous shape, a schema change and
a deploy are never simultaneous.

## The reserved Phase 2 columns

`tenants.fb_page_id`, `tenants.fb_page_access_token`, `articles.hook_text`,
`articles.fb_post_id`, `articles.fb_comment_id` exist but are unused. Leave them.
They are there so enabling Facebook automation later is additive rather than a
migration against live data.

`fb_page_access_token` is encrypted at rest when it starts being written. Do not
store it in plaintext "for now".

## Seeding

`libs/database/src/seed/` creates the two launch tenants and their categories for
local development. Seeds are for development only and must never run against
production. They are not a migration and must be independently runnable.

## Connections

One pooled connection from `apps/api`, one from `apps/worker`. The worker holds
long-running transactions during publish — keep pool sizes separate so a stuck job
can't starve the API.

Nothing else connects to Postgres. Not the admin, not the websites, not a serverless
function. The API is the only door.

## Related

- `tenant-isolation.md` — the query-level rules these indexes support
- `article-status-lifecycle.md` — what the status column means
- `background-work.md` — why the media status index exists
