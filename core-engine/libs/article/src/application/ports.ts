import type { TenantId } from '@core/shared';
import type { PublicAuthorProfile } from '@core/author';
import type { Article } from '../domain/article';

export const ARTICLE_REPOSITORY = Symbol('ARTICLE_REPOSITORY');

export interface PublishedArticleListItem {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  publishedAt: Date;
  categorySlug: string | null;
  /** The byline. Every article has an author — author_id is NOT NULL. */
  authorName: string;
  /** Null on rows predating the profile feature; the byline is then unlinked. */
  authorUsername: string | null;
  /**
   * Square avatar rendition, or null. Null is the common case — authors
   * register without uploading one — so cards must render a fallback.
   */
  authorAvatarUrl: string | null;
}

export interface PublishedArticleDetail extends PublishedArticleListItem {
  content: unknown;
  /**
   * The author's profile, present when they have a username. This is what the
   * end-of-article byline card renders. Contact fields are already redacted by
   * `toPublicProfile` according to the author's opt-in — the transport layer
   * serialises this as-is and makes no visibility decision of its own.
   */
  author: PublicAuthorProfile | null;
}

export interface ListPublishedOptions {
  page: number;
  perPage: number;
  categorySlug?: string;
  /**
   * Filters to one author's published work. Reuses the same scoped query rather
   * than a parallel one, so the tenant and published predicates cannot drift
   * between "all articles" and "this author's articles".
   */
  authorUsername?: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
}

/**
 * Article counts for the backoffice dashboard.
 *
 * `mine` is separated from the tenant totals because the two answer different
 * questions — "how is the site doing" versus "what have I left unfinished" — and
 * a contributor who can only see their own work still needs the second one.
 */
export interface ArticleStats {
  published: number;
  draft: number;
  total: number;
  mine: {
    published: number;
    draft: number;
    total: number;
  };
}

/**
 * Options for the ADMIN list. Distinct from ListPublishedOptions because this
 * surface may return any status — keeping them separate is what stops a public
 * caller ever reaching a code path that could return a draft.
 */
export interface ListForAdminOptions {
  page: number;
  perPage: number;
  /** Omit for every status. */
  status?: 'draft' | 'published';
  /** Restricts to one author's own work. */
  authorId?: string;
  /** Case-insensitive match on the title. */
  search?: string;
}

/** A row in the admin article list. Any status, so nothing is assumed present. */
export interface AdminArticleListItem {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  authorId: string;
  authorName: string;
  categoryId: string | null;
  categoryName: string | null;
}

/**
 * A row in the dashboard's recent-activity list. Deliberately NOT
 * `PublishedArticleListItem`: this surface shows drafts, so `excerpt`,
 * `coverImage` and `publishedAt` are all legitimately absent. Reusing the
 * published type would force those to be non-null and invite a cast.
 */
export interface RecentArticleItem {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  /** Null while the article has never been published. */
  publishedAt: Date | null;
  updatedAt: Date;
  authorName: string;
  categoryName: string | null;
}

/**
 * tenantId is the FIRST and REQUIRED parameter of every method. An optional or
 * trailing tenantId makes an unscoped query a typo away rather than a compile
 * error. See core-engine/docs/tenant-isolation.md.
 */
export interface ArticleRepository {
  /** Published only, enforced in SQL — never by filtering a fetched list. */
  listPublished(
    tenantId: TenantId,
    options: ListPublishedOptions,
  ): Promise<Paginated<PublishedArticleListItem>>;

  findPublishedBySlug(
    tenantId: TenantId,
    slug: string,
  ): Promise<PublishedArticleDetail | null>;

  findById(tenantId: TenantId, articleId: string): Promise<Article | null>;

  /**
   * Counts for the dashboard, in one round trip rather than four.
   *
   * `authorId` is required, not optional: every caller has one (it comes off the
   * resolved principal), and making it optional would produce a `mine` block
   * silently counting nothing when it was forgotten.
   */
  getStats(tenantId: TenantId, authorId: string): Promise<ArticleStats>;

  /**
   * Most recently touched articles, ANY status — this is an admin surface.
   *
   * Ordered by `updated_at`, not `published_at`: the question a dashboard
   * answers is "what has been worked on", and ordering by publish date would
   * push every draft to the bottom regardless of how recently it was edited.
   */
  listRecent(tenantId: TenantId, limit: number): Promise<RecentArticleItem[]>;

  // ── Admin surface ──────────────────────────────────────────────────────────

  /** Any status. Never reachable from a public controller. */
  listForAdmin(
    tenantId: TenantId,
    options: ListForAdminOptions,
  ): Promise<Paginated<AdminArticleListItem>>;

  /**
   * The read model behind a single-article admin response: the row as stored,
   * with the author and category names joined.
   *
   * Separate from `findById` because that returns the AGGREGATE, and an
   * aggregate deliberately does not carry storage bookkeeping like
   * `updated_at`. Reconstructing the response from the aggregate alone meant
   * inventing a value for it — which shipped as `new Date()`, so the editor
   * reported every article as "edited just now" regardless of the truth.
   */
  findDetailById(
    tenantId: TenantId,
    articleId: string,
  ): Promise<(AdminArticleListItem & { content: unknown }) | null>;

  create(tenantId: TenantId, article: Article): Promise<void>;

  /**
   * Persists an existing aggregate. Takes the whole Article rather than a patch
   * so every write goes through the domain — a repository that accepted loose
   * fields would let a caller set `status` without the transition guards.
   */
  update(tenantId: TenantId, article: Article): Promise<void>;

  delete(tenantId: TenantId, articleId: string): Promise<void>;

  /**
   * Whether a slug is taken WITHIN this tenant. `exceptId` lets an article keep
   * its own slug while editing.
   *
   * The unique index still backs this — the check is for a clean 409 instead of
   * a raw constraint violation, not for correctness. Two concurrent creates can
   * still race past it, and the database is what actually decides.
   */
  slugExists(
    tenantId: TenantId,
    slug: string,
    exceptId?: string,
  ): Promise<boolean>;
}
