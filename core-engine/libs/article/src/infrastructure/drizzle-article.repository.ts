import { Inject, Injectable } from '@nestjs/common';
import { and, eq, desc, ilike, ne, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  articles,
  authors,
  media,
  categories,
} from '@core/database';
import {
  asArticleId,
  asAuthorId,
  asCategoryId,
  asTenantId,
  type TenantId,
} from '@core/shared';
// Cross-context import of a pure domain projection, not of infrastructure.
// The redaction rule for an author's contact details belongs to the author
// context and must not be reimplemented here — one copy, one place to be wrong.
import { toPublicProfile } from '@core/author';
import { Article, type ArticleStatus } from '../domain/article';
import type {
  AdminArticleListItem,
  ArticleRepository,
  ArticleStats,
  ListForAdminOptions,
  ListPublishedOptions,
  Paginated,
  PublishedArticleDetail,
  PublishedArticleListItem,
  RecentArticleItem,
} from '../application/ports';

@Injectable()
export class DrizzleArticleRepository implements ArticleRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listPublished(
    tenantId: TenantId,
    options: ListPublishedOptions,
  ): Promise<Paginated<PublishedArticleListItem>> {
    // Published-only is a SQL predicate, not a post-filter. Combined with the
    // tenant predicate this is what makes drafts unreachable from the public
    // surface by construction.
    const where = and(
      eq(articles.tenantId, tenantId),
      eq(articles.status, 'published'),
      options.categorySlug ? eq(categories.slug, options.categorySlug) : undefined,
      options.authorUsername ? eq(authors.username, options.authorUsername) : undefined,
    );

    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        coverImage: articles.coverImage,
        publishedAt: articles.publishedAt,
        categorySlug: categories.slug,
        authorName: authors.name,
        authorUsername: authors.username,
        authorAvatarUrl: media.url,
        authorAvatarVariants: media.variants,
      })
      .from(articles)
      // The joined table is scoped too — a correctly scoped root query joined to
      // an unscoped table still leaks.
      // innerJoin, not left: author_id is NOT NULL with an FK, so an article
      // without an author cannot exist. A left join here would silently hide a
      // referential-integrity failure behind a null byline.
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(eq(categories.id, articles.categoryId), eq(categories.tenantId, tenantId)),
      )
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, tenantId)),
      )
      .where(where)
      .orderBy(desc(articles.publishedAt))
      .limit(options.perPage)
      .offset((options.page - 1) * options.perPage);

    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(articles)
      // The count must join exactly what the page query joins, or the two
      // disagree and pagination reports a total it cannot produce.
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(eq(categories.id, articles.categoryId), eq(categories.tenantId, tenantId)),
      )
      .where(where);

    return {
      data: rows.map(toListItem),
      total: count?.total ?? 0,
    };
  }

  async findPublishedBySlug(
    tenantId: TenantId,
    slug: string,
  ): Promise<PublishedArticleDetail | null> {
    // Slug alone is NOT unique — slugs collide across tenants by design.
    const [row] = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        coverImage: articles.coverImage,
        publishedAt: articles.publishedAt,
        content: articles.content,
        categorySlug: categories.slug,
        authorName: authors.name,
        authorUsername: authors.username,
        authorEmail: authors.email,
        authorAvatarUrl: media.url,
        authorAvatarVariants: media.variants,
        authorQuote: authors.quote,
        authorTelegram: authors.telegram,
        authorContactPublic: authors.contactPublic,
      })
      .from(articles)
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      // Avatar media, scoped on both sides so one tenant's image can never
      // surface under another's author. See docs/tenant-isolation.md.
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(eq(categories.id, articles.categoryId), eq(categories.tenantId, tenantId)),
      )
      .where(
        and(
          eq(articles.tenantId, tenantId),
          eq(articles.slug, slug),
          eq(articles.status, 'published'),
        ),
      )
      .limit(1);

    if (!row) return null;

    return {
      ...toListItem(row),
      content: row.content,
      // Redaction happens in the domain, not here and not in the controller.
      // Passing the row through `toPublicProfile` means the opt-in is applied
      // in exactly one place, so no caller can bypass it by asking differently.
      author: toPublicProfile({
        username: row.authorUsername,
        name: row.authorName,
        email: row.authorEmail,
        quote: row.authorQuote,
        telegram: row.authorTelegram,
        contactPublic: row.authorContactPublic,
        // Square rendition where the sweep has produced one, else the
        // original — a just-uploaded avatar is `pending` for a few seconds and
        // showing the heavier original beats showing nothing.
        avatarUrl: row.authorAvatarUrl
          ? (row.authorAvatarVariants?.avatar?.url ?? row.authorAvatarUrl)
          : null,
      }),
    };
  }

  async findById(tenantId: TenantId, articleId: string): Promise<Article | null> {
    const [row] = await this.db
      .select()
      .from(articles)
      .where(and(eq(articles.tenantId, tenantId), eq(articles.id, articleId)))
      .limit(1);

    if (!row) return null;

    return Article.fromProps({
      id: asArticleId(row.id),
      tenantId: asTenantId(row.tenantId),
      authorId: asAuthorId(row.authorId),
      categoryId: row.categoryId ? asCategoryId(row.categoryId) : null,
      title: row.title,
      slug: row.slug,
      content: row.content,
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      status: row.status as ArticleStatus,
      publishedAt: row.publishedAt,
    });
  }

  // ── Admin surface ──────────────────────────────────────────────────────────

  async listForAdmin(
    tenantId: TenantId,
    options: ListForAdminOptions,
  ): Promise<Paginated<AdminArticleListItem>> {
    // Tenant first, always. Every other predicate is appended to it, so no
    // filter combination can produce an unscoped query.
    const filters = [eq(articles.tenantId, tenantId)];

    if (options.status) filters.push(eq(articles.status, options.status));
    if (options.authorId) filters.push(eq(articles.authorId, options.authorId));
    if (options.search?.trim()) {
      // ilike with the term escaped — a title containing % or _ would otherwise
      // turn into a wildcard and quietly match everything.
      const term = options.search.trim().replace(/[\\%_]/g, c => `\\${c}`);
      filters.push(ilike(articles.title, `%${term}%`));
    }

    const where = and(...filters);
    const offset = (options.page - 1) * options.perPage;

    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        excerpt: articles.excerpt,
        coverImage: articles.coverImage,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        authorId: articles.authorId,
        authorName: authors.name,
        categoryId: articles.categoryId,
        categoryName: categories.name,
      })
      .from(articles)
      // Both joins scoped on BOTH sides — joining on id alone would let another
      // tenant's author name or category surface here.
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(
          eq(categories.id, articles.categoryId),
          eq(categories.tenantId, tenantId),
        ),
      )
      .where(where)
      // Recently worked on, matching the dashboard's ordering.
      .orderBy(desc(articles.updatedAt))
      .limit(options.perPage)
      .offset(offset);

    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(articles)
      .where(where);

    return {
      data: rows.map(row => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status as 'draft' | 'published',
        excerpt: row.excerpt,
        coverImage: row.coverImage,
        publishedAt: row.publishedAt,
        updatedAt: row.updatedAt,
        authorId: row.authorId,
        authorName: row.authorName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
      })),
      total: count?.total ?? 0,
    };
  }

  async findDetailById(
    tenantId: TenantId,
    articleId: string,
  ): Promise<(AdminArticleListItem & { content: unknown }) | null> {
    // Same joins and the same tenant scoping as listForAdmin, so the editor and
    // the list can never disagree about an article's author, category or
    // updated time.
    const [row] = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        excerpt: articles.excerpt,
        coverImage: articles.coverImage,
        content: articles.content,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        authorId: articles.authorId,
        authorName: authors.name,
        categoryId: articles.categoryId,
        categoryName: categories.name,
      })
      .from(articles)
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(
          eq(categories.id, articles.categoryId),
          eq(categories.tenantId, tenantId),
        ),
      )
      .where(and(eq(articles.tenantId, tenantId), eq(articles.id, articleId)))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status as 'draft' | 'published',
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      content: row.content,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      authorId: row.authorId,
      authorName: row.authorName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
    };
  }

  async create(tenantId: TenantId, article: Article): Promise<void> {
    const p = article.toProps();
    await this.db.insert(articles).values({
      id: p.id,
      // From the parameter, NOT from the aggregate: the caller's tenant is the
      // authority, and taking it off the object would trust whatever built it.
      tenantId,
      authorId: p.authorId,
      categoryId: p.categoryId,
      title: p.title,
      slug: p.slug,
      content: p.content,
      excerpt: p.excerpt,
      coverImage: p.coverImage,
      status: p.status,
      publishedAt: p.publishedAt,
    });
  }

  async update(tenantId: TenantId, article: Article): Promise<void> {
    const p = article.toProps();
    await this.db
      .update(articles)
      .set({
        categoryId: p.categoryId,
        title: p.title,
        slug: p.slug,
        content: p.content,
        excerpt: p.excerpt,
        coverImage: p.coverImage,
        status: p.status,
        publishedAt: p.publishedAt,
        updatedAt: new Date(),
      })
      // Tenant in the WHERE, not just the id. Without it a leaked id from
      // another tenant would write across the boundary.
      .where(and(eq(articles.tenantId, tenantId), eq(articles.id, p.id)));
  }

  async delete(tenantId: TenantId, articleId: string): Promise<void> {
    // Hard delete. Unlike media — which is soft-deleted because live pages and
    // Facebook caches still reference the URL — an article row has no such
    // dependents once it is gone from the public query.
    await this.db
      .delete(articles)
      .where(and(eq(articles.tenantId, tenantId), eq(articles.id, articleId)));
  }

  async slugExists(
    tenantId: TenantId,
    slug: string,
    exceptId?: string,
  ): Promise<boolean> {
    const filters = [eq(articles.tenantId, tenantId), eq(articles.slug, slug)];
    // Lets an article keep its own slug through an edit.
    if (exceptId) filters.push(ne(articles.id, exceptId));

    const [row] = await this.db
      .select({ id: articles.id })
      .from(articles)
      .where(and(...filters))
      .limit(1);

    return Boolean(row);
  }

  async getStats(tenantId: TenantId, authorId: string): Promise<ArticleStats> {
    // One scan with conditional aggregates rather than four COUNT queries. The
    // dashboard is the first screen after login, so the round trips are the
    // cost worth avoiding — and every branch below shares the same tenant
    // predicate, which is exactly what keeps them from drifting apart.
    const [row] = await this.db
      .select({
        published: sql<number>`count(*) filter (where ${articles.status} = 'published')`,
        draft: sql<number>`count(*) filter (where ${articles.status} = 'draft')`,
        total: sql<number>`count(*)`,
        minePublished: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.authorId} = ${authorId})`,
        mineDraft: sql<number>`count(*) filter (where ${articles.status} = 'draft' and ${articles.authorId} = ${authorId})`,
        mineTotal: sql<number>`count(*) filter (where ${articles.authorId} = ${authorId})`,
      })
      .from(articles)
      .where(eq(articles.tenantId, tenantId));

    // Postgres returns count() as bigint, which node-postgres hands back as a
    // STRING to avoid precision loss. Without Number() these serialise as
    // "12" and the UI renders quoted numbers — or worse, adds them as strings.
    return {
      published: Number(row?.published ?? 0),
      draft: Number(row?.draft ?? 0),
      total: Number(row?.total ?? 0),
      mine: {
        published: Number(row?.minePublished ?? 0),
        draft: Number(row?.mineDraft ?? 0),
        total: Number(row?.mineTotal ?? 0),
      },
    };
  }

  async listRecent(
    tenantId: TenantId,
    limit: number,
  ): Promise<RecentArticleItem[]> {
    const rows = await this.db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        publishedAt: articles.publishedAt,
        updatedAt: articles.updatedAt,
        authorName: authors.name,
        categoryName: categories.name,
      })
      .from(articles)
      // Both joins are tenant-scoped on BOTH sides. Joining on id alone would
      // let another tenant's author name or category surface here if an id ever
      // leaked across — see docs/tenant-isolation.md.
      .innerJoin(
        authors,
        and(eq(authors.id, articles.authorId), eq(authors.tenantId, tenantId)),
      )
      .leftJoin(
        categories,
        and(
          eq(categories.id, articles.categoryId),
          eq(categories.tenantId, tenantId),
        ),
      )
      .where(eq(articles.tenantId, tenantId))
      // Recently WORKED ON, not recently published — a draft edited an hour ago
      // is more relevant to this screen than an article published last month.
      .orderBy(desc(articles.updatedAt))
      .limit(limit);

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status as 'draft' | 'published',
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      authorName: row.authorName,
      categoryName: row.categoryName,
    }));
  }
}

interface ListRow {
  authorAvatarUrl?: string | null;
  authorAvatarVariants?: Record<string, { url: string }> | null;
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
  categorySlug: string | null;
  authorName: string;
  authorUsername: string | null;
}

/**
 * excerpt, coverImage and publishedAt are non-null on anything published — the
 * aggregate refuses to publish without them. The DB columns stay nullable
 * because drafts legitimately lack them, so this narrows at the boundary.
 */
function toListItem(row: ListRow): PublishedArticleListItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ?? '',
    coverImage: row.coverImage ?? '',
    publishedAt: row.publishedAt ?? new Date(0),
    categorySlug: row.categorySlug,
    authorName: row.authorName,
    // Null on author rows predating the profile feature. The site renders the
    // name unlinked in that case rather than linking to /author/null.
    authorUsername: row.authorUsername,
    // Square rendition where the sweep produced one, else the original — a
    // just-uploaded avatar is `pending` for a few seconds, and showing the
    // heavier original beats showing nothing.
    authorAvatarUrl: row.authorAvatarUrl
      ? (row.authorAvatarVariants?.avatar?.url ?? row.authorAvatarUrl)
      : null,
  };
}
