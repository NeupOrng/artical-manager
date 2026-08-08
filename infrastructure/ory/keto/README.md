# Keto — deployed, not the authority

Decided 2026-08-07. Running and migrated, but **`RoleGuard` in NestJS reads
`authors.role`**, not Keto.

## Why permissions are not in Keto yet

Keto answers relationship questions: *is this user an editor of that specific
article, via membership in that group, which was granted by that other group?*
That is a graph, and Keto is very good at graphs.

The actual permission model here is:

- does the principal's `tenant_id` match the row's `tenant_id`, and
- is their role one of `admin` > `editor` > `contributor`

That is two comparisons against a row already loaded to resolve the principal. It
is a guard, not a graph.

Making Keto the authority today would add a network round trip to the hot path of
every admin request, and — worse — create **two sources of truth for one fact**.
The role would live in `authors.role` *and* in a Keto tuple, and they would drift
the first time a role changed during a failed request. Debugging "the UI says
editor but the API says contributor" across two datastores is a genuinely bad
afternoon.

## When to switch

The trigger is permissions becoming *relational* — any of:

- per-article collaborators ("Sam can edit this one piece")
- editorial groups or desks that own a set of categories
- delegation, where an author grants someone else access to their own work
- cross-tenant roles of any kind

At that point `authors.role` stops being expressive enough and the network hop
starts paying for itself.

## The namespaces

`keto.yml` declares `Tenant`, `Article`, and `Platform` so the ids are stable
before any tuple exists. Namespace ids are part of the storage layout — choosing
them now costs nothing and renumbering later means a migration.

There is intentionally **no `namespaces.keto.ts` permission DSL** in this
directory. Writing a relation model that nothing evaluates would be a fiction
that drifts silently from the guard that actually runs. It gets written in the
same change that first calls Keto's check API.
