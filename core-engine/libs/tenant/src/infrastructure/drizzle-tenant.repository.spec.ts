import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@core/database';
import { DrizzleTenantRepository } from './drizzle-tenant.repository';

/**
 * Runs against the seeded local database. Run `task db:seed` first.
 *
 * These exist because `listAllWithStats` shipped once returning **zero for every
 * count** — the correlated subquery it originally used did not render the outer
 * column reference, so the predicate never matched. Nothing threw. The dashboard
 * simply showed a platform with no authors and no articles, which is
 * indistinguishable from a brand-new install.
 *
 * A silent wrong answer needs a test asserting a REAL number. Asserting
 * "returns two tenants" would have passed against the broken version.
 */
const url
  = process.env.DATABASE_URL
    ?? 'postgres://artical:change-me-locally@localhost:5432/artical';

let client: postgres.Sql;
let repo: DrizzleTenantRepository;

beforeAll(() => {
  client = postgres(url, { max: 2, onnotice: () => {} });
  repo = new DrizzleTenantRepository(drizzle(client, { schema }));
});

afterAll(async () => {
  await client.end();
});

describe('DrizzleTenantRepository.listAllWithStats', () => {
  it('returns every tenant', async () => {
    const rows = await repo.listAllWithStats();

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map(r => r.name)).toEqual(
      expect.arrayContaining(['Technology Site', 'Gaming Site']),
    );
  });

  it('counts authors per tenant — NOT zero', async () => {
    const rows = await repo.listAllWithStats();

    // The regression. Every seeded tenant has at least one author, so a zero
    // here means the aggregation is broken again.
    for (const row of rows) {
      expect(row.authorCount).toBeGreaterThan(0);
    }
  });

  it('counts published and draft articles per tenant — NOT zero', async () => {
    const rows = await repo.listAllWithStats();

    for (const row of rows) {
      expect(row.publishedCount).toBeGreaterThan(0);
      // The seed deliberately creates a draft per tenant precisely so that
      // "the public surface never returns it" is testable — so it is also a
      // reliable non-zero here.
      expect(row.draftCount).toBeGreaterThan(0);
    }
  });

  it('attributes counts to the right tenant rather than summing everything', async () => {
    const rows = await repo.listAllWithStats();
    const tech = rows.find(r => r.name === 'Technology Site');
    const gaming = rows.find(r => r.name === 'Gaming Site');

    expect(tech).toBeDefined();
    expect(gaming).toBeDefined();

    // Cross-check against a per-tenant count. If the grouping key were wrong,
    // every tenant would show the same (platform-wide) total — which is the
    // other plausible-looking failure mode after "all zeros".
    const perTenant = await client<{ tenant_id: string, n: string }[]>`
      select tenant_id, count(*)::text as n from articles
      where status = 'published' group by tenant_id
    `;

    const expected = new Map(perTenant.map(r => [r.tenant_id, Number(r.n)]));
    expect(tech!.publishedCount).toBe(expected.get(tech!.id) ?? 0);
    expect(gaming!.publishedCount).toBe(expected.get(gaming!.id) ?? 0);
  });

  it('exposes no article content — aggregates only', async () => {
    const [row] = await repo.listAllWithStats();

    // Root CLAUDE.md §1: a platform admin has no access to tenant content. This
    // asserts the shape rather than trusting a reviewer to notice a field being
    // added later.
    expect(Object.keys(row!).sort()).toEqual([
      'authorCount',
      'domain',
      'draftCount',
      'id',
      'name',
      'nicheLabel',
      'publishedCount',
    ]);
  });
});
