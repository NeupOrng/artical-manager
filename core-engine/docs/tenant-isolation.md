# Tenant isolation

The most important invariant in this codebase. A leak here is a cross-customer data
breach, not a bug. Read before writing any query.

## Where isolation is enforced

**The data layer.** Not the UI, not the gateway, not a middleware that "usually"
runs. Every repository method takes `tenant_id` and every query filters on it.

The UI and the gateway are conveniences. The database query is the control.

## Repository signature rule

```ts
// Correct
findBySlug(tenantId: TenantId, slug: string): Promise<Article | null>
list(tenantId: TenantId, filter: ArticleFilter): Promise<Article[]>
save(tenantId: TenantId, article: Article): Promise<void>

// Wrong — optional means "omitted by accident compiles fine"
findBySlug(slug: string, tenantId?: TenantId)

// Wrong — buried in an options bag is easy to forget
findBySlug({ slug, tenantId })
```

`tenantId` is **first and required**, always. This makes an unscoped call a compile
error rather than a silent full-table read.

## Branded type

```ts
// libs/shared/src/types/ids.ts
export type TenantId = string & { readonly __brand: 'TenantId' }
```

A bare `string` cannot be passed where a `TenantId` is expected, so an `articleId`
or a user-supplied value can't slide into the tenant slot.

## Query rule

Every Drizzle query touching `authors`, `articles`, `categories`, or `media`
includes the tenant predicate:

```ts
await db.select().from(articles)
  .where(and(
    eq(articles.tenantId, tenantId),   // never optional
    eq(articles.slug, slug),
  ))
```

No exceptions — including lookups that seem unable to collide. **Slugs collide
across tenants by design**: both sites may publish `/best-laptops-2026`. A query by
slug alone returns the wrong tenant's article, and it will look like it works right
up until it doesn't.

Joins scope every joined table, not just the root one.

## Where tenantId comes from

Only from the resolved `AuthorContext` (admin routes) or the tenant API key mapped
by Kong (public routes). Never from a request body, query param, path segment, or
client-settable header. See `auth-request-flow.md`.

## Cross-tenant access returns 404

Not 403. A 403 confirms the resource exists, which leaks the existence of another
tenant's content. Fetch scoped by tenant; if nothing comes back, it's a 404 —
naturally and without a special case.

## Database-level backstop

Add a composite index and a unique constraint that carry `tenant_id` as the leading
column:

```sql
UNIQUE (tenant_id, slug)          -- not UNIQUE (slug)
INDEX  (tenant_id, status, published_at DESC)
```

The unique constraint is a correctness guard as much as a performance one — a global
unique on `slug` would let one tenant's publishing block another's.

Row-level security is not currently used; the API connects as one role. If that
changes, RLS becomes a genuine second layer rather than a substitute for these rules.

## Testing requirement

**Every repository method gets a test that proves it filters by tenant.** The shape:

1. seed the same slug/id under tenant A and tenant B
2. query as tenant A
3. assert tenant B's row is not returned

A repository method merged without this test is an incomplete change. This is the
one place where test coverage is mandatory rather than judgment.

Also worth having: a test that lists every table with a `tenant_id` column and
asserts each has a corresponding repository whose methods all require it — cheap
protection against a new table being added without wiring.

## Related

- `auth-request-flow.md` — how `tenantId` is resolved
- `api-conventions.md` — 404-not-403, public/admin split
- `database-and-migrations.md` — schema conventions
