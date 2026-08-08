---
name: tenant-isolation-audit
description: Audit the codebase for cross-tenant data leaks — unscoped queries, repository methods with optional tenantId, shared DTOs between public and admin surfaces, client-supplied tenant ids, and missing isolation tests. Use this whenever the user asks to check, audit, verify, or review tenant isolation or multi-tenancy safety; before a release or deploy; after merging backend work; or whenever they express any worry about one tenant seeing another's data. Run it proactively before shipping anything that touched repositories, queries, or the public API.
---

# Tenant isolation audit

A leak here is a cross-customer data breach, not a bug. `core-engine/docs/tenant-isolation.md`
states the rules; this skill is the procedure for checking they actually hold.

Isolation is enforced in the **data layer**. The UI and the gateway are
conveniences. The query predicate is the control — so that's what to audit.

## Scope the audit

Default to the full backend. If the user points at a recent change, audit that
change plus anything it touches, and say which you did — "the articles repository
is clean" reads very differently from "the codebase is clean".

## What to check

**1. Repository signatures.** Every method touching `authors`, `articles`,
`categories`, or `media` takes `tenantId` first and required.

```ts
findBySlug(tenantId: TenantId, slug: string)     // correct
findBySlug(slug: string, tenantId?: TenantId)    // optional means omittable
findBySlug({ slug, tenantId })                   // easy to forget in an options bag
```

**2. Query predicates.** Every Drizzle query includes `eq(table.tenantId, tenantId)`.

Grep for `.from(articles)`, `.from(media)`, and so on, then read each hit. Pay
particular attention to queries that look like they can't collide — a lookup by
slug alone returns the wrong tenant's article and will appear to work indefinitely.

**3. Joins.** Every joined table is scoped, not just the root one. A correctly
scoped `articles` query joined to an unscoped `categories` still leaks.

**4. The source of `tenantId`.** It comes from the resolved `AuthorContext` or the
tenant API key. Search for anywhere it's read from a request body, query param,
path segment, or header — those are the ones that matter.

**5. Public/admin DTO separation.** Confirm `/public/v1` handlers don't share
response types or serializers with `/admin/v1`, and that published-only filtering
happens in SQL rather than by filtering an already-fetched list.

**6. 404 vs 403.** Cross-tenant access returns 404. A 403 confirms the resource
exists, which is itself the leak.

**7. Isolation tests exist.** Each repository method should have a test that seeds
the same slug or id under two tenants, queries as one, and asserts the other's row
is absent. This is the one place where missing coverage is a finding rather than a
judgment call.

**8. Database constraints.** Uniques and indexes lead with `tenant_id`. A global
`UNIQUE (slug)` is a finding even though it never leaks data — it lets one tenant
block another's publishing.

## Reporting

Lead with anything exploitable today, then latent risks (a correct query with an
optional signature that invites future mistakes), then missing tests.

For each finding give the file and line, what an attacker or an unlucky user would
actually see, and the fix. "Unscoped query" is not actionable; "tenant B's author
can fetch tenant A's draft via `GET /admin/v1/articles/:id` because
`findById` omits the predicate" is.

If nothing's wrong, say so plainly and name what you checked. A clean audit that
lists its scope is useful; a clean audit that doesn't is unverifiable.

## Don't fix while auditing

Report first. Some findings are one-line query fixes, but others are signature
changes that ripple through call sites and want their own review. Mixing the audit
and the fix into one pass makes both harder to check.
