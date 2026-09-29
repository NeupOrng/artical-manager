---
name: change-db-schema
description: Change the Drizzle schema in core-engine and generate/apply a migration safely — tenant-leading indexes, additive-first column changes, reading the generated SQL before committing, updating docs/data-model.md in the same change, and keeping seeds in sync. Use this whenever the user asks to add or change a column, table, index, constraint, or enum; asks to "add a field to Article", "record view counts", "add is_sponsored"; or asks anything about migrations. Also use it when a feature request implies a schema change even if the user hasn't said so, since retrofitting a column onto populated tables is far more expensive than getting it right the first time.
---

# Changing the database schema

Read `core-engine/docs/database-and-migrations.md` first — it holds the
conventions. This skill covers the sequence and the two places where a plausible
change causes real damage.

## Before editing anything: is this a tenant-scoped table?

Everything except `tenants` carries `tenant_id`, and that changes how constraints
are written:

```sql
UNIQUE (tenant_id, slug)      -- correct
UNIQUE (slug)                 -- a correctness bug
```

A global unique on `slug` lets one tenant's publishing block another's. Slug
collisions across tenants are expected — both sites may run
`/best-laptops-2026`. The same reasoning applies to indexes: lead with
`tenant_id`, because every query filters on it.

## Sequence

**1. Edit the schema file** in `core-engine/libs/database/src/schema/`.

**2. Think about whether the column can be `NOT NULL` yet.**

Adding a non-nullable column to a populated table locks and fails. The additive
path is three migrations, not one:

1. add the column nullable (with a default if that makes sense)
2. backfill
3. add the `NOT NULL` constraint

On an empty local database step 1 alone appears to work, which is exactly why this
gets missed until it hits an environment with data. If the table has rows
anywhere, take the long path.

Renames follow the same shape: add, dual-write, migrate reads, drop. Bear in mind
the public sites may still be serving ISR pages built against the previous shape,
so a schema change and a deploy are never simultaneous.

**3. Generate the migration.**

```bash
task db:generate
```

**4. Read the generated SQL.** Not optional.

`drizzle-kit` output is a draft. Open the file in
`libs/database/src/migrations/` and check for:

- accidental `DROP` statements
- a table rewrite where you expected an `ALTER`
- constraints that lost their `tenant_id` leading column
- enum changes, which Postgres handles awkwardly and often need a manual approach

If the SQL doesn't match your intent, fix the schema and regenerate rather than
hand-editing — a hand-edited migration diverges from what Drizzle believes the
schema is, and the next generate produces nonsense.

**5. Apply and verify.**

```bash
task db:migrate
task db:psql     # \d <table> to confirm what actually landed
```

**6. Update `core-engine/docs/data-model.md`.** Required, not optional.

That file is the schema contract — people read it *instead of* opening nine
schema files, so a stale row there is worse than no doc at all. What to touch
depends on the change:

| Change | Update |
|---|---|
| New column | Its table's section; the column table if it has one |
| New table | A `###` section, its FKs in the delete table, a line on the map |
| New/changed FK | The delete-behaviour table — every FK is listed there |
| Nullable → NOT NULL | The column note, and **Known gaps** if it was listed |
| New partial unique or soft delete | The relevant pattern section |
| Dropped column or table | Remove it. A doc describing a column that no longer exists is the worst kind |

If a change makes an existing claim false, correcting it is part of the change.
The doc states it describes *applied* state — keep that true.

**7. Update the seed** in `libs/database/src/seed/` if the new column is needed
for local development, and the Bruno collection in `/api` if it's exposed.

## Never edit an applied migration

Once a migration has run anywhere shared, it's immutable — write a new one. Drizzle
tracks applied migrations by hash, so editing one silently desynchronises every
environment that already ran it.

## Two changes worth raising rather than assuming

Both are open items in the root `CLAUDE.md`, and both are cheap now and expensive
later. If a task touches either, flag it rather than deciding unilaterally:

- **Article view recording.** "Popular this month" can't be backfilled. If views
  aren't recorded from launch, that feature can never cover the launch period.
- **`is_sponsored` on Article.** Sponsored disclosure is a field, not a taxonomy
  row. One boolean now versus a migration against live data later.

## The reserved Phase 2 columns

`fb_page_id`, `fb_page_access_token`, `hook_text`, `fb_post_id`, `fb_comment_id`
are intentionally unused. They exist so enabling Facebook automation is additive.
Leave them alone; don't "clean them up".

When `fb_page_access_token` starts being written, it's encrypted at rest — not
stored in plaintext "for now".
