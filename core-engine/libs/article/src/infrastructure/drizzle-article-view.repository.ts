import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  articles,
  articleViews,
  articleViewCounts,
} from '@core/database';
import type { TenantId } from '@core/shared';
import { v7 as uuidv7 } from 'uuid';
import type { ArticleViewRepository, RecordedView } from '../application/view-ports';

@Injectable()
export class DrizzleArticleViewRepository implements ArticleViewRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(tenantId: TenantId, articleId: string): Promise<RecordedView | null> {
    // The endpoint is public and anonymous, so `articleId` is attacker
    // -controlled. Verify it is THIS tenant's and PUBLISHED before writing
    // anything — without this, anyone could manufacture views against another
    // tenant's draft, and the draft's existence would leak through the total.
    const [article] = await this.db
      .select({ id: articles.id, slug: articles.slug, title: articles.title })
      .from(articles)
      .where(
        and(
          eq(articles.tenantId, tenantId),
          eq(articles.id, articleId),
          eq(articles.status, 'published'),
        ),
      )
      .limit(1);

    if (!article) return null;

    // One transaction: the event log and the running total must not diverge.
    // The total is a cache of the log, so a crash between the two writes would
    // leave a number that a later rebuild silently contradicts.
    const total = await this.db.transaction(async (tx) => {
      await tx.insert(articleViews).values({
        id: uuidv7(),
        tenantId,
        articleId,
      });

      const [row] = await tx
        .insert(articleViewCounts)
        .values({ tenantId, articleId, total: 1 })
        .onConflictDoUpdate({
          target: [articleViewCounts.tenantId, articleViewCounts.articleId],
          // Increment in SQL, never read-modify-write in application code:
          // two concurrent readers would both read N and both write N+1.
          set: {
            total: sql`${articleViewCounts.total} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ total: articleViewCounts.total });

      return row?.total ?? 1;
    });

    return { total, slug: article.slug, title: article.title };
  }

  async totalsFor(
    tenantId: TenantId,
    articleIds: string[],
  ): Promise<Record<string, number>> {
    // inArray with an empty list generates `in ()`, which is a syntax error in
    // Postgres. An empty request is legitimate (a category with no articles).
    if (articleIds.length === 0) return {};

    const rows = await this.db
      .select({
        articleId: articleViewCounts.articleId,
        total: articleViewCounts.total,
      })
      .from(articleViewCounts)
      .where(
        and(
          eq(articleViewCounts.tenantId, tenantId),
          inArray(articleViewCounts.articleId, articleIds),
        ),
      );

    // Articles with no views are absent rather than zero-filled — the caller
    // renders zero, and inventing rows here would mean writing on a read.
    return Object.fromEntries(rows.map((r) => [r.articleId, r.total]));
  }
}
