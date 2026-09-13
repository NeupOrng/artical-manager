import type { TenantId } from '@core/shared';

export const ARTICLE_VIEW_REPOSITORY = Symbol('ARTICLE_VIEW_REPOSITORY');

/**
 * What recording a view returns. `slug` and `title` ride along because the
 * publish check already reads the article row, and readership analytics needs
 * both — returning them here saves a second query on every view.
 */
export interface RecordedView {
  total: number;
  slug: string;
  title: string;
}

/**
 * Readership lives in the `article` context rather than in a new one.
 * core-engine/CLAUDE.md requires justification for a sixth bounded context, and
 * "how many people read this article" is a fact about an article, not a
 * separate domain with its own language and lifecycle.
 *
 * tenantId is the FIRST and REQUIRED parameter of every method, as everywhere
 * else. See core-engine/docs/tenant-isolation.md.
 */
export interface ArticleViewRepository {
  /**
   * Records one view and returns the article's new total.
   *
   * Returns the total so the caller can render the number the reader just
   * caused without a second round trip.
   *
   * Returns null when the article does not exist, does not belong to this
   * tenant, or is not published. That check is the whole reason this takes a
   * repository call rather than a blind insert: the endpoint is public and
   * anonymous, so `articleId` is attacker-controlled input, and without it
   * anyone could create view rows against another tenant's draft.
   */
  record(tenantId: TenantId, articleId: string): Promise<RecordedView | null>;

  /**
   * Totals for a set of articles, for the listing grid.
   *
   * Batched deliberately: a card grid would otherwise issue one request per
   * card. Articles with no views yet are simply absent from the map — the
   * caller renders zero rather than the repository inventing rows.
   */
  totalsFor(
    tenantId: TenantId,
    articleIds: string[],
  ): Promise<Record<string, number>>;
}
