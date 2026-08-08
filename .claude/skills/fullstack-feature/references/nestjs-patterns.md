# NestJS patterns for this codebase

How to write backend code here. The *rules* live in `core-engine/docs/`; this is
the craft — idioms, patterns, and the traps that cost an afternoon.

## Contents

- [Layer boundaries in practice](#layer-boundaries-in-practice)
- [Dependency injection and ports](#dependency-injection-and-ports)
- [Aggregates and invariants](#aggregates-and-invariants)
- [Drizzle patterns](#drizzle-patterns)
- [Transactions](#transactions)
- [Controllers and DTOs](#controllers-and-dtos)
- [Guards, decorators, filters](#guards-decorators-filters)
- [Polled background work](#polled-background-work)
- [Testing](#testing)
- [Config](#config)

---

## Layer boundaries in practice

```
apps/api ──┐
           ├──► libs/*/application ──► libs/*/domain
apps/worker┘              │
                          └──► ports (interfaces) ◄── libs/*/infrastructure
```

The practical test for "which layer does this go in":

- Does it express a business rule that would still be true if we swapped Postgres
  for anything else? → `domain/`
- Does it orchestrate a sequence of steps, calling out to storage or queues? →
  `application/`
- Does it know about Drizzle, MinIO, sharp, or HTTP? → `infrastructure/` or
  `apps/`

ESLint enforces the import bans, but the bans exist so the domain stays testable
with zero mocks and readable by someone who doesn't know NestJS.

**`apps/` is the driving adapter**, not "the app". Controllers translate HTTP into
a use-case call and back. A controller containing an `if` about business state has
logic the worker can't reach — which is exactly the duplication this structure
exists to prevent.

---

## Dependency injection and ports

The application layer declares what it needs; infrastructure satisfies it. Use
`Symbol` tokens so bindings are explicit and the domain never imports a concrete
class.

```ts
// libs/article/src/application/ports.ts
export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');

export interface ArticleRepository {
  findById(tenantId: TenantId, id: ArticleId): Promise<Article | null>;
  findBySlug(tenantId: TenantId, slug: string): Promise<Article | null>;
  save(tenantId: TenantId, article: Article): Promise<void>;
}
```

```ts
// apps/api/src/modules/articles/articles.module.ts
@Module({
  controllers: [ArticlesController],
  providers: [
    ScheduleArticleUseCase,
    { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
    { provide: CLOCK, useClass: SystemClock },
  ],
})
export class ArticlesModule {}
```

Inject by token:

```ts
constructor(
  @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
  @Inject(CLOCK) private readonly clock: Clock,
) {}
```

**The `Clock` port is not ceremony.** Scheduling logic that calls `new Date()`
internally can only be tested by waiting or by mocking global time. Injecting
`now` makes "scheduling in the past is rejected" a one-line test.

---

## Aggregates and invariants

State transitions go through the aggregate; nothing assigns `status` directly.

```ts
export class Article {
  schedule(at: Date, now: Date): void {
    if (!this.excerpt) throw new MissingExcerptError(this.id);
    if (!this.coverImage) throw new MissingCoverImageError(this.id);
    if (at <= now) throw new ScheduleInPastError(this.id, at);
    if (this.status === 'published') throw new AlreadyPublishedError(this.id);

    this.status = 'scheduled';
    this.scheduledAt = at;
  }
}
```

Why this matters beyond tidiness: `apps/api` schedules on a user click and
`apps/worker` publishes on a timer. Both call the same methods, so the rules can't
diverge between the two paths. Putting a guard in the controller means the worker
skips it.

**Thin contexts don't need this.** `category` and `media` are close to CRUD.
`domain/` holding a type alias and a slug validator is the correct outcome, not
under-design. Manufacturing an aggregate for a four-column table costs future
readers more than it returns.

---

## Drizzle patterns

Always import the schema namespace and let inference do the work:

```ts
import { eq, and, desc, sql } from 'drizzle-orm';
import { articles } from '@core/database';
```

The tenant predicate is on **every** query, including ones that look like they
can't collide:

```ts
async findBySlug(tenantId: TenantId, slug: string): Promise<Article | null> {
  const [row] = await this.db
    .select()
    .from(articles)
    .where(and(eq(articles.tenantId, tenantId), eq(articles.slug, slug)))
    .limit(1);

  return row ? toDomain(row) : null;
}
```

Slugs collide across tenants by design — both sites may publish
`/best-laptops-2026`. A query by slug alone returns the wrong tenant's article and
appears to work indefinitely.

**Joins scope every table**, not just the root:

```ts
.innerJoin(categories, and(
  eq(categories.id, articles.categoryId),
  eq(categories.tenantId, tenantId),   // easy to omit, and it leaks
))
```

**Public reads filter status in SQL**, never by filtering a fetched list:

```ts
.where(and(
  eq(articles.tenantId, tenantId),
  eq(articles.status, 'published'),
))
```

**Mapping**: keep `toDomain(row)` / `toRow(entity)` functions in
`infrastructure/`. Don't let Drizzle row types leak into the domain — the domain
owns its own shape, and row types change when the schema does.

---

## Transactions

Use one when several writes must land together:

```ts
await this.db.transaction(async (tx) => {
  await tx.update(articles).set({ ... }).where(...);
  await tx.insert(articleRevisions).values({ ... });
});
```

**Side effects belong outside the transaction.** Enqueue jobs and call
revalidation *after* it commits:

```ts
await this.db.transaction(async (tx) => { /* persist */ });
await this.revalidateQueue.add(JOB.REVALIDATE_SITE, { tenantId, paths });
```

Enqueueing inside means the worker can pick the job up before the commit lands and
read stale state. And a failed revalidation must never roll back a publish — an
article that's live but not yet revalidated is recoverable; one that silently
failed to publish is not.

---

## Controllers and DTOs

```ts
@ApiTags('articles')
@Controller('admin/v1/articles')
export class ArticlesController {
  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule an article for future publication' })
  async schedule(
    @CurrentAuthor() author: AuthorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleArticleDto,
  ) {
    return this.scheduleArticle.execute(author.tenantId, asArticleId(id), dto.scheduledAt);
  }
}
```

- **Transitions are verbs on sub-resources**, not `PATCH { status }`. A generic
  PATCH accepting `status` is a way around the aggregate's guards.
- **`tenantId` comes from `@CurrentAuthor()`**, never from the request.
- The global pipe runs `whitelist` + `forbidNonWhitelisted`, so unknown fields are
  rejected rather than dropped. A client sending `tenantId` gets an error, which is
  what you want.

DTOs validate *input shape*; the aggregate validates *state*. Both, because
they're different jobs — a well-formed request can still be an illegal transition.

```ts
export class ScheduleArticleDto {
  @ApiProperty({ example: '2026-09-01T10:00:00Z' })
  @IsISO8601()
  scheduledAt!: string;
}
```

Keep public and admin DTOs in separate modules. Not a shared type with fields
omitted — separate, so "someone adds a field and drafts leak" isn't reachable.

---

## Guards, decorators, filters

**Guard resolves identity to tenant context.** It reads the one header Oathkeeper
set, resolves the `Author`, and attaches context:

```ts
const identityId = req.headers['x-kratos-identity-id'];
if (!identityId) throw new UnauthorizedException();

const author = await this.authors.findByKratosIdentityId(identityId);
if (!author) throw new ForbiddenException();  // valid session, no tenant assignment
```

Resolve per request rather than caching `tenantId` or `role` — a role change or
deactivation has to take effect immediately. A ~30s Redis cache is fine if the
lookup shows up in profiling; longer is not.

Never auto-provision an `Author` for an unknown identity. That would silently grant
access to anyone who completed registration.

**Exception filter maps domain errors to HTTP** in one place:

| `DomainError.kind` | Status |
|---|---|
| `invariant` | 422 |
| `conflict` | 409 |
| `not-found` | 404 |
| `forbidden` | 403 |

Controllers never throw `HttpException`. Adding a domain error without adding its
mapping means the client gets a 500 for something that should be a 422.

Cross-tenant access returns **404, not 403** — a 403 confirms the resource exists,
which is itself the leak.

---

## Polled background work

```ts
@Processor(QUEUE.PUBLISH)
export class PublishArticleProcessor extends WorkerHost {
  async process(job: Job<PublishArticlePayload>): Promise<void> {
    const { tenantId, articleId } = job.data;

    const article = await this.articles.findById(asTenantId(tenantId), asArticleId(articleId));
    if (!article) return;                          // deleted
    if (article.status === 'published') return;    // already done
    if (article.status === 'draft') return;        // unscheduled — stale job

    article.publish(this.clock.now());
    await this.articles.save(asTenantId(tenantId), article);
    await this.revalidate.add(/* ... */);
  }
}
```

Three things that are load-bearing:

- **Idempotency.** Queues deliver more than once. Re-read state and return quietly
  if there's nothing to do. Throwing on a stale job turns a benign race into a
  retry storm and a false alert.
- **Payloads carry ids, never entities** — so a payload can't go stale between
  enqueue and execution.
- **Domain invariant failures aren't retryable.** They'll fail identically forever.
  Distinguish them from transient infra errors so backoff doesn't hide a real
  problem.

Enqueue with a deterministic `jobId` so re-adding replaces rather than duplicates,
and so unschedule can find and remove it.

**The boot reconciler is not optional.** Redis holds the timer; Postgres holds the
truth. On start, find `status = 'scheduled'` articles with no live job and
re-enqueue them. Without it, a Redis restart silently drops every scheduled
publish — no error, no failed job, nobody finds out until a reader asks.

---

## Testing

**Domain — no mocks.** This is the payoff for keeping the layer pure:

```ts
it('refuses to schedule without a cover image', () => {
  const article = anArticle({ excerpt: 'x', coverImage: null });
  expect(() => article.schedule(tomorrow, now)).toThrow(MissingCoverImageError);
});
```

**Application — in-memory port fakes**, not a database and not `vi.mock`. A hand-
written `InMemoryArticleRepository` is faster to write than a mock chain and reads
like documentation.

**Repositories — the isolation test is mandatory.** The shape:

```ts
it('does not return another tenant\'s article with the same slug', async () => {
  await seedArticle({ tenantId: tenantA, slug: 'shared-slug' });
  await seedArticle({ tenantId: tenantB, slug: 'shared-slug' });

  const found = await repo.findBySlug(tenantA, 'shared-slug');
  expect(found?.tenantId).toBe(tenantA);
});
```

Every repository method gets one. This is the single place where missing coverage
is a defect rather than a judgment call.

**First-time setup**: Vitest does not read `paths` from `tsconfig.json`, so
`@core/database` and `@core/shared` won't resolve out of the box. Add a Vitest
config that mirrors the aliases (or use a tsconfig-paths plugin) once, at the root
of `core-engine`, rather than working around it per file.

Repository tests need a real Postgres. The compose stack is already there — point
tests at it, and make each test clean up after itself so runs stay independent.

---

## Config

Env is validated with zod at boot, so the process refuses to start on a bad config
rather than failing at the first request. Add new variables to the schema in
`apps/*/src/config/env.ts` **and** to `infrastructure/env/.env.example` — an env
var that only exists on someone's machine doesn't exist.

Read config through `ConfigService`, and prefer `getOrThrow` for anything required.
Never `process.env` directly outside the config layer — it bypasses validation and
hides the dependency.
