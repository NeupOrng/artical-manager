import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DATABASE, type Database, tenants, authors, articles } from '@core/database';
import { asTenantId, type TenantId } from '@core/shared';
import type { Tenant } from '../domain/tenant';
import type { TenantRepository, TenantWithStats } from '../application/ports';

@Injectable()
export class DrizzleTenantRepository implements TenantRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(tenantId: TenantId): Promise<Tenant | null> {
    const [row] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!row) return null;

    return {
      id: asTenantId(row.id),
      name: row.name,
      domain: row.domain,
      nicheLabel: row.nicheLabel,
      umamiWebsiteId: row.umamiWebsiteId,
    };
  }

  async listAllWithStats(): Promise<TenantWithStats[]> {
    // Three grouped queries merged in memory, rather than one query with
    // correlated subqueries or joins.
    //
    // NOT a join: two one-to-many joins off `tenants` multiply against each
    // other — a tenant with 3 authors and 10 articles yields 30 rows, and both
    // counts come back inflated in a way that looks plausible until checked.
    //
    // NOT correlated subqueries either, learned the hard way: interpolating
    // `${tenants.id}` into a sql`` template inside a select field does not
    // render as an outer-column reference, so the predicate never matches and
    // every count comes back 0 — a silent wrong answer, not an error.
    //
    // Three round trips is the right trade at this cardinality: the caller is a
    // platform admin looking at a handful of tenants, and each query here is
    // trivially checkable against psql.
    //
    // AGGREGATES ONLY. No titles, no slugs, no excerpts — see the port for why
    // that boundary is the design rather than an omission.
    const [tenantRows, authorCounts, articleCounts] = await Promise.all([
      this.db
        .select({
          id: tenants.id,
          name: tenants.name,
          domain: tenants.domain,
          nicheLabel: tenants.nicheLabel,
          umamiWebsiteId: tenants.umamiWebsiteId,
        })
        .from(tenants)
        .orderBy(tenants.name),

      this.db
        .select({
          tenantId: authors.tenantId,
          count: sql<number>`count(*)::int`,
        })
        .from(authors)
        .groupBy(authors.tenantId),

      this.db
        .select({
          tenantId: articles.tenantId,
          status: articles.status,
          count: sql<number>`count(*)::int`,
        })
        .from(articles)
        .groupBy(articles.tenantId, articles.status),
    ]);

    const authorsByTenant = new Map(
      authorCounts.map(r => [r.tenantId, r.count]),
    );
    // Keyed on tenant AND status together, so a tenant with only drafts does
    // not accidentally read another tenant's published count.
    const articlesByTenantStatus = new Map(
      articleCounts.map(r => [`${r.tenantId}:${r.status}`, r.count]),
    );

    return tenantRows.map(row => ({
      id: asTenantId(row.id),
      name: row.name,
      domain: row.domain,
      nicheLabel: row.nicheLabel,
      // A tenant with no authors or no articles has no row in the grouped
      // results at all — absent means zero here, which is why these default
      // rather than assuming a row exists.
      authorCount: authorsByTenant.get(row.id) ?? 0,
      publishedCount: articlesByTenantStatus.get(`${row.id}:published`) ?? 0,
      draftCount: articlesByTenantStatus.get(`${row.id}:draft`) ?? 0,
      umamiWebsiteId: row.umamiWebsiteId,
    }));
  }
}
