import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { asTenantId } from '@core/shared';
import * as schema from '@core/database';
import {
  articles,
  articleViews,
  articleViewCounts,
  type Database,
} from '@core/database';
import { DrizzleArticleViewRepository } from './drizzle-article-view.repository';

/**
 * Tenant isolation test. Required for every repository method.
 *
 * Runs against the seeded local database. Run `task db:seed` first.
 */
const TECH = asTenantId('0198f000-0000-7000-8000-000000000001');
const GAMING = asTenantId('0198f000-0000-7000-8000-000000000002');
const SHARED_SLUG = 'shared-slug-across-tenants';
const DRAFT_SLUG = 'a-draft-nobody-should-see';

const url =
  process.env.DATABASE_URL ??
  'postgres://artical:change-me-locally@localhost:5432/artical';

let client: postgres.Sql;
let db: Database;
let repo: DrizzleArticleViewRepository;

let techArticleId: string;
let gamingArticleId: string;
let techDraftId: string;

async function idFor(tenantId: string, slug: string): Promise<string> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.tenantId, tenantId), eq(articles.slug, slug)))
    .limit(1);
  if (!row) throw new Error(`missing fixture ${slug} for ${tenantId}`);
  return row.id;
}

/** Each test starts from a known count, so runs stay independent. */
async function reset(articleId: string): Promise<void> {
  await db.delete(articleViews).where(eq(articleViews.articleId, articleId));
  await db
    .delete(articleViewCounts)
    .where(eq(articleViewCounts.articleId, articleId));
}

beforeAll(async () => {
  client = postgres(url, { max: 2, onnotice: () => {} });
  db = drizzle(client, { schema });
  repo = new DrizzleArticleViewRepository(db);

  techArticleId = await idFor(TECH, SHARED_SLUG);
  gamingArticleId = await idFor(GAMING, SHARED_SLUG);
  techDraftId = await idFor(TECH, DRAFT_SLUG);

  await reset(techArticleId);
  await reset(gamingArticleId);
  await reset(techDraftId);
});

afterAll(async () => {
  await reset(techArticleId);
  await reset(gamingArticleId);
  await reset(techDraftId);
  await client.end();
});

describe('DrizzleArticleViewRepository — tenant isolation', () => {
  it('refuses to record a view against another tenant\'s article', async () => {
    // The gaming tenant's article, recorded as the technology tenant. Without
    // the tenant predicate this would happily create a row and inflate another
    // tenant's count from a foreign key.
    const leaked = await repo.record(TECH, gamingArticleId);
    expect(leaked).toBeNull();

    const totals = await repo.totalsFor(GAMING, [gamingArticleId]);
    expect(totals[gamingArticleId]).toBeUndefined();
  });

  it('does not return another tenant\'s totals', async () => {
    await repo.record(GAMING, gamingArticleId);

    const asGaming = await repo.totalsFor(GAMING, [gamingArticleId]);
    expect(asGaming[gamingArticleId]).toBe(1);

    // Same id, wrong tenant. Must be absent, not the count.
    const asTech = await repo.totalsFor(TECH, [gamingArticleId]);
    expect(asTech[gamingArticleId]).toBeUndefined();
  });

  it('refuses to record a view against an unpublished article', async () => {
    // A draft is not readable, so it cannot have been read. Allowing this would
    // also leak the draft's existence through its total.
    const result = await repo.record(TECH, techDraftId);
    expect(result).toBeNull();
  });

  it('refuses an article id that does not exist', async () => {
    const result = await repo.record(TECH, '00000000-0000-4000-8000-000000000000');
    expect(result).toBeNull();
  });
});

describe('DrizzleArticleViewRepository — counting', () => {
  it('increments the total and returns the new value', async () => {
    await reset(techArticleId);

    expect((await repo.record(TECH, techArticleId))?.total).toBe(1);
    expect((await repo.record(TECH, techArticleId))?.total).toBe(2);
    expect((await repo.record(TECH, techArticleId))?.total).toBe(3);
  });

  it('keeps the event log and the running total in agreement', async () => {
    await reset(techArticleId);
    await repo.record(TECH, techArticleId);
    await repo.record(TECH, techArticleId);

    const events = await db
      .select()
      .from(articleViews)
      .where(eq(articleViews.articleId, techArticleId));

    const totals = await repo.totalsFor(TECH, [techArticleId]);

    // The total is a cache of the log. If these ever disagree, the total can no
    // longer be rebuilt from the events and the log stops being authoritative.
    expect(events).toHaveLength(2);
    expect(totals[techArticleId]).toBe(2);
  });

  it('survives concurrent views without losing any', async () => {
    await reset(techArticleId);

    // Read-modify-write in application code would lose most of these; the
    // increment happens in SQL precisely so it cannot.
    await Promise.all(
      Array.from({ length: 20 }, () => repo.record(TECH, techArticleId)),
    );

    const totals = await repo.totalsFor(TECH, [techArticleId]);
    expect(totals[techArticleId]).toBe(20);
  });

  it('omits articles with no views rather than returning zero', async () => {
    await reset(techArticleId);
    const totals = await repo.totalsFor(TECH, [techArticleId]);
    expect(totals[techArticleId]).toBeUndefined();
  });

  it('returns an empty map for an empty id list', async () => {
    // `inArray` with an empty list is a Postgres syntax error, and an empty
    // request is legitimate — a category page with nothing published in it.
    expect(await repo.totalsFor(TECH, [])).toEqual({});
  });
});
