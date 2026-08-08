# core-engine/CLAUDE.md — Backend architecture & domain knowledge

Technical reference for the **NestJS monorepo** — the API and the background worker.
Requirements and scope live in the root `CLAUDE.md`; this file is about *how* the
backend is built.

Scope note: this directory is backend only. The Nuxt backoffice lives at `/admin`
and is a client of this API like any other — see `admin/CLAUDE.md`.

## Read before you change anything

`docs/` holds the operational knowledge needed to make a correct change. Read the
relevant one first; don't infer these rules from existing code.

| Doc | Read it before… |
|---|---|
| `docs/article-status-lifecycle.md` | touching article status or publishing |
| `docs/api-conventions.md` | adding or changing any endpoint |
| `docs/api-reference.md` | **any endpoint work** — the response contract the frontends hand-write their types from. Update it in the same change, or the types they were written against become a lie. |
| `docs/auth-request-flow.md` | touching guards, headers, or identity |
| `docs/tenant-isolation.md` | writing any query or repository method |
| `docs/background-work.md` | touching the worker or polled background work |
| `docs/media-and-uploads.md` | touching uploads, MinIO, or image URLs |
| `docs/database-and-migrations.md` | changing the schema |

---

## Layout

```
apps/
  api/              NestJS HTTP app — transport layer only
    src/
      modules/      One module per bounded context: controllers, DTOs, wiring
        tenants/ authors/ articles/ categories/ media/ public/ health/
      common/
        guards/        AuthorContextGuard, RoleGuard
        decorators/    @CurrentAuthor(), @Roles()
        filters/       Domain error → HTTP status mapping
        interceptors/  Logging, serialization
        pipes/         class-validator wiring
      config/       Env schema + typed config
    test/
  worker/           NestJS standalone app — polls Postgres, no queue client
    src/
      processors/   media-sweeper (image derivatives)
      config/
    test/

libs/               Bounded contexts — all business logic lives here
  tenant/ author/ article/ category/ media/
    src/
      domain/          Entities, value objects, aggregates, invariants, events
      application/     Use cases + port interfaces (repositories, clock, buses)
      infrastructure/  Drizzle repository implementations, adapters
  database/         Drizzle schema, migrations, seed, connection factory
  shared/           Cross-context types, constants, error classes, utils

docs/               The knowledge base above
```

One `package.json`, one `nest-cli.json`, one `tsconfig` with path aliases at the
root of this directory. `apps/api` and `apps/worker` build from the same source tree
via a single `Dockerfile` (`--build-arg APP=api|worker`).

**Current state:** `database`, `shared`, `tenant`, `article`, `media` and `author`
have code and are registered in `nest-cli.json` / `tsconfig` paths /
`vitest.config.ts`. `category` is still an empty directory — register it (a
`projects` entry plus a `@core/<name>` alias, and the Vitest alias) when it gets
its first file. An empty lib registered early breaks the build, since it has no
`index.ts`.

`author` is deliberately thin: no aggregate, because a profile has no state
machine. What it does own is the contact-visibility projection
(`toPublicProfile`) — the single place the `contact_public` opt-in is applied.
`libs/article` imports that pure function rather than reimplementing the rule,
which is the one sanctioned cross-context import here.

---

## Layering rules

Dependencies point inward. `domain` knows nothing about anything else.

```
apps/api ──┐
           ├──► libs/*/application ──► libs/*/domain
apps/worker┘              │
                          └──► ports (interfaces) ◄── libs/*/infrastructure
```

- **`domain/`** — pure TypeScript. No NestJS decorators, no Drizzle, no `Date.now()`,
  no I/O. Must be testable with zero mocks. This is where invariants live.
- **`application/`** — orchestrates use cases. Depends on *port interfaces* it
  defines itself, never on concrete infrastructure.
- **`infrastructure/`** — implements those ports with Drizzle / MinIO / sharp.
- **`apps/api/src/modules/*`** — controllers, DTOs, Swagger decorators, and the Nest
  module that binds ports to implementations. **No business logic.** If a controller
  contains an `if` about business state, it's in the wrong layer.

`apps/worker` and `apps/api` import the same application services, so a use case
behaves identically whichever drives it.

### Why `apps/` sits outside `libs/`

`apps/*` are **driving adapters** — the HTTP surface and the worker sweep that call
into the core. `libs/*/infrastructure` holds **driven adapters** — Drizzle, MinIO,
sharp — which the core calls. Both are adapters; they differ in
direction, and they're split on disk because:

- **The dependency rule becomes enforceable.** Apps import libs; libs must never
  import apps. Keep an eslint `no-restricted-paths` (or dependency-cruiser) rule
  banning `libs/**` → `apps/**` so the cycle can't be introduced accidentally.
- **Apps are deployables, libs are not.** Each app has a `main.ts` and its own
  Docker image; libs produce no artifact. This is also what `nest build <app>`
  expects.
- **The delivery mechanism is swappable, and here it actually is** — an HTTP
  request and a polled sweep drive the same use case.
- **They grow on different axes.** `apps/` grows with deployment topology, `libs/`
  with the business domain.

Strict hexagonal would push controllers into `libs/*/infrastructure/http/`. We don't,
because Nest needs buildable entrypoints and because controllers legitimately span
contexts (the editor screen touches articles + categories + media in one request).
The rule that matters is *business logic never lives in a delivery mechanism*; this
layout is what makes it visible and lintable.

### Intentional asymmetry

`article` and `media` are the substantial contexts and get the full treatment. `category`,
`media`, `tenant`, and `author` are close to CRUD — they keep the same folders for
consistency, but **do not manufacture aggregates or domain events for them.** Empty
ceremony is worse than no ceremony. If `category/domain/` only ever holds a type
alias and a slug validator, that is the correct outcome.

---

## Module wiring

Bind ports via symbol tokens declared in the lib, not by importing concrete classes
into the module's provider list:

```ts
// libs/article/src/application/ports.ts
export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY')

export interface ArticleRepository {
  findById(tenantId: TenantId, id: ArticleId): Promise<Article | null>
  // …
}

// apps/api/src/modules/articles/articles.module.ts
providers: [
  { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
]
```

This is what lets the domain be tested without a database, and lets the worker swap
nothing while reusing everything.

---

## The Article aggregate — the reference example

Every state transition goes through the aggregate. Nothing assigns `status` directly.

```ts
// libs/article/src/domain/article.ts
export class Article {
  publish(now: Date): void {
    if (!this.excerpt) throw new MissingExcerptError(this.id)
    if (!this.coverImage) throw new MissingCoverImageError(this.id)

    // Idempotent: a double click or retried request must not produce a second date.
    if (this.status === 'published') return

    this.status = 'published'
    // Set once — republishing keeps the canonical date.
    this.publishedAt ??= now
  }
}
```

`now` is injected, never read inside the domain — that keeps `publishedAt`
deterministic in tests. Full state machine in `docs/article-status-lifecycle.md`.

---

## Tenant isolation

Non-negotiable, and the single most important invariant in this codebase.

```ts
// Correct — tenantId is required and first
findBySlug(tenantId: TenantId, slug: string): Promise<Article | null>

// Wrong — makes cross-tenant access one typo away
findBySlug(slug: string, tenantId?: TenantId): Promise<Article | null>
```

- `tenantId` is the **first parameter** of every repository method, required.
- Every Drizzle query includes `eq(table.tenantId, tenantId)`. No exceptions — not
  even for lookups that "obviously" can't collide. Slugs collide across tenants by
  design.
- `tenantId` comes from the resolved `Author` record, never from a request body,
  query param, or client-controlled header.
- Use a branded `TenantId` type, not a bare `string`, so a plain string can't be
  passed by accident.

Detail and test requirements in `docs/tenant-isolation.md`.

---

## What NOT to do

- **No auth in NestJS.** No Passport, no JWT verification, no password hashing, no
  session handling. Read one validated header. See `docs/auth-request-flow.md`.
- **No business logic in controllers, DTOs, or the admin UI.** If the admin needs to
  know whether an article can be scheduled, it asks the API.
- **No `tenant_id` from client input.** Ever.
- **No direct `status` assignment** outside the aggregate.
- **No message queue.** Background work is polled from Postgres. Adding a broker
  back needs a real justification, not habit.
- **No logic duplicated between `apps/api` and `apps/worker`** — put it in `libs/`
  and import it twice.
- **No new top-level module** without checking it isn't part of an existing bounded
  context. Five contexts cover the product; a sixth needs justification.
- **No `any` on a boundary** — DTOs, repository returns, and job payloads are typed.

---

## Conventions

- **Errors** — domain throws typed errors from `libs/shared/src/errors`; one
  exception filter maps them to HTTP. Controllers never throw `HttpException`.
- **Time** — injected via a `Clock` port. Never `new Date()` inside domain code.
- **IDs** — UUID v7 (sortable), generated in the application layer.
- **Validation** — class-validator on DTOs at the edge; invariants in the domain.
  Both, because they're different jobs: DTO validation rejects malformed *input*,
  the aggregate rejects invalid *state*.
- **Testing** — domain: unit tests, no mocks. Application: tests against in-memory
  port fakes. `apps/*`: thin e2e. Every repository method gets a test proving it
  filters by `tenant_id`.
- **Swagger** — every endpoint documented, and `/api` (Bruno) updated in the same
  change when routes move.
