---
name: add-bounded-context
description: Scaffold and wire a new DDD bounded context in the core-engine NestJS monorepo (libs/<name> with domain/application/infrastructure, nest-cli.json registration, tsconfig path alias, port tokens, module binding). Use this whenever the user asks to add, create, or build out a bounded context, a new lib, or a domain area in core-engine — including phrasings like "build the article context", "add scheduling to the backend", or "start the media module". Also use it when picking up one of the empty libs (article, author, category, media, scheduling, tenant), since registering them wrong breaks the build.
---

# Adding a bounded context

The six context directories under `core-engine/libs/` exist but are empty. This
skill covers taking one from empty directory to wired-and-building.

Read `core-engine/CLAUDE.md` first — the layering rules and the Article aggregate
example live there, and this skill assumes them rather than repeating them.

## Why the wiring is fiddly

Two things bite people here:

- **An empty lib registered in `nest-cli.json` breaks the build**, because Nest
  looks for an `index.ts` that doesn't exist. So registration is the *last* step,
  not the first. If the build suddenly fails after you touch config, this is why.
- **`apps/` importing `libs/` is fine; the reverse is not.** ESLint enforces it,
  but the error only appears once there's code to lint. Knowing the rule up front
  saves an awkward refactor.

## Sequence

Work in this order — each step leaves the repo in a state that still builds.

**1. Decide whether this context is rich or thin.**

`article` and `scheduling` carry real invariants and get the full treatment.
`category`, `media`, `tenant`, and `author` are close to CRUD. For a thin context,
`domain/` holding a type alias and a slug validator is the *correct* outcome — not
a sign you've under-designed it. Manufacturing an aggregate and domain events for
a table with four columns costs future readers more than it returns.

If unsure which kind you're building, ask rather than defaulting to the heavier
shape.

**2. Write the domain layer.**

Pure TypeScript in `libs/<name>/src/domain/`. No NestJS decorators, no Drizzle, no
`new Date()`, no I/O — ESLint blocks the imports, but the deeper reason is that
this layer has to be testable with zero mocks and readable by someone who doesn't
know the framework.

Inject `now: Date` rather than reading the clock. That single habit is what makes
scheduling logic testable, and it's the most common thing to get wrong.

**3. Define ports in `application/`.**

Port interfaces belong to the application layer, not to infrastructure — the core
declares what it needs, and infrastructure satisfies it. Use a `Symbol` token so
the binding is explicit:

```ts
// libs/<name>/src/application/ports.ts
export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');

export interface ArticleRepository {
  findById(tenantId: TenantId, id: ArticleId): Promise<Article | null>;
}
```

Every repository method takes `tenantId` first and required. This is not a style
preference — see `core-engine/docs/tenant-isolation.md` for why an optional
`tenantId` turns cross-tenant access into a typo.

**4. Implement `infrastructure/`.**

Drizzle repositories that satisfy the ports. Every query carries the tenant
predicate, including lookups that look like they can't collide — slugs collide
across tenants by design.

**5. Add the barrel, then register.**

Create `libs/<name>/src/index.ts` exporting the public surface. Only now:

- add a `projects` entry in `core-engine/nest-cli.json`
- add `@core/<name>` and `@core/<name>/*` to `paths` in `core-engine/tsconfig.json`
- create `libs/<name>/tsconfig.lib.json` (copy an existing one — they're identical
  apart from `outDir`)

**6. Bind in the consuming app.**

In `apps/api/src/modules/<name>/<name>.module.ts`, bind the token to the concrete
class:

```ts
providers: [{ provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository }]
```

Register the module in `apps/api/src/app.module.ts`. If the worker needs the same
use case, it imports the same application service — never a reimplementation.

## Verify before you call it done

```bash
task check          # typecheck + lint + tests
task build          # both apps compile
```

Lint passing matters specifically here: it's what proves the layering held. A
green `task check` with a domain file importing Drizzle is not possible, which is
the point.

Then write the isolation test described in
`core-engine/docs/tenant-isolation.md` — seed the same slug under two tenants,
query as one, assert the other's row is absent. A repository merged without it is
an incomplete change.

## When the context needs background work

There is no message queue. Work is polled from Postgres — the table itself is the
work list, claimed with `FOR UPDATE SKIP LOCKED`. Read
`core-engine/docs/background-work.md` before adding a sweep; the idempotency and
stuck-row reclaim requirements there are load-bearing, not advice.
