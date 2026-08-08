import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { asTenantId } from '@core/shared';
import * as schema from '@core/database';
import { DrizzleArticleRepository } from './drizzle-article.repository';

/**
 * Tenant isolation test. Required for every repository method — this is the one
 * place where missing coverage is a defect rather than a judgment call, because
 * what it protects is cross-customer data separation.
 *
 * Runs against the seeded local database, which deliberately gives BOTH tenants
 * an article at the slug `shared-slug-across-tenants`. Run `task db:seed` first.
 */
const TECH = asTenantId('0198f000-0000-7000-8000-000000000001');
const GAMING = asTenantId('0198f000-0000-7000-8000-000000000002');
const SHARED_SLUG = 'shared-slug-across-tenants';

const url =
  process.env.DATABASE_URL ??
  'postgres://artical:change-me-locally@localhost:5432/artical';

let client: postgres.Sql;
let repo: DrizzleArticleRepository;

beforeAll(() => {
  client = postgres(url, { max: 2, onnotice: () => {} });
  repo = new DrizzleArticleRepository(drizzle(client, { schema }));
});

afterAll(async () => {
  await client.end();
});

describe('DrizzleArticleRepository — tenant isolation', () => {
  it("findPublishedBySlug returns only the calling tenant's article", async () => {
    const tech = await repo.findPublishedBySlug(TECH, SHARED_SLUG);
    const gaming = await repo.findPublishedBySlug(GAMING, SHARED_SLUG);

    expect(tech).not.toBeNull();
    expect(gaming).not.toBeNull();

    // Same slug, different rows. A query by slug alone would return whichever
    // row Postgres felt like, and would appear to work indefinitely.
    //
    // Asserted on ids rather than title text on purpose: the seed carries real
    // fixture prose that changes as the sites are designed, and a test that
    // breaks on copy edits gets deleted rather than fixed.
    expect(tech!.id).not.toBe(gaming!.id);

    // And each id is genuinely unreachable from the other tenant.
    expect(await repo.findById(GAMING, tech!.id)).toBeNull();
    expect(await repo.findById(TECH, gaming!.id)).toBeNull();
  });

  it("listPublished never returns another tenant's rows", async () => {
    const techList = await repo.listPublished(TECH, { page: 1, perPage: 100 });
    const gamingList = await repo.listPublished(GAMING, { page: 1, perPage: 100 });

    expect(techList.data.length).toBeGreaterThan(0);
    expect(gamingList.data.length).toBeGreaterThan(0);

    const gamingIds = new Set(gamingList.data.map((a) => a.id));
    const overlap = techList.data.filter((a) => gamingIds.has(a.id));

    expect(overlap).toEqual([]);
  });
});

describe('DrizzleArticleRepository — published-only enforcement', () => {
  it('does not return drafts by slug', async () => {
    expect(
      await repo.findPublishedBySlug(TECH, 'a-draft-nobody-should-see'),
    ).toBeNull();
  });

  it('excludes drafts from the list', async () => {
    const { data, total } = await repo.listPublished(TECH, { page: 1, perPage: 100 });

    expect(data.some((a) => a.slug === 'a-draft-nobody-should-see')).toBe(false);
    expect(total).toBe(data.length);
  });
});
