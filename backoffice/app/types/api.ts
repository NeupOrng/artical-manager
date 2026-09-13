/**
 * Hand-written from `core-engine/docs/api-reference.md`.
 *
 * There is no codegen and no shared package — decided 2026-08-08. That doc is
 * the contract; these types are this app's copy of it. **When an endpoint
 * changes, read the doc and update this file.** Nothing here is checked against
 * the backend at build time, so a stale type is a runtime surprise rather than a
 * compile error. The Bruno collection in `/api` is how you verify a shape is
 * still real.
 *
 * Keep every type in this file rather than beside its component, so there is one
 * place to reconcile against the doc.
 */

/** `GET /admin/v1/me` */
export interface Me {
  kind: 'author' | 'platform-admin'
  id: string
  /** Null on author rows predating the profile feature. */
  username: string | null
  name: string
  /** Present for tenant authors; null for platform admins, who have no tenant. */
  tenantId: string | null
  /**
   * The site's display name. Null for platform admins by design, and for an
   * author only if the tenant row vanished — render without it rather than
   * showing the raw id.
   */
  tenantName: string | null
  /** Present for tenant authors; null for platform admins. */
  role: AuthorRole | null
}

export type AuthorRole = 'admin' | 'editor' | 'contributor'

export type ArticleStatus = 'draft' | 'published'

export interface ArticleCounts {
  published: number
  draft: number
  total: number
}

export interface RecentArticle {
  id: string
  title: string
  slug: string
  status: ArticleStatus
  /** ISO 8601 UTC. Null while the article has never been published. */
  publishedAt: string | null
  /** ISO 8601 UTC. What the list is ordered by. */
  updatedAt: string
  authorName: string
  categoryName: string | null
}

export interface AuthorDashboard {
  kind: 'author'
  tenantName: string
  role: AuthorRole
  /** Everything in the tenant. */
  articles: ArticleCounts
  /** This author's own work only. */
  mine: ArticleCounts
  mediaCount: number
  /** Most recently edited, any status. Capped at 8 by the API. */
  recent: RecentArticle[]
}

export interface TenantSummary {
  id: string
  name: string
  domain: string
  nicheLabel: string
  authorCount: number
  publishedCount: number
  draftCount: number
  /** Article views over the last 30 UTC days. Null = analytics not set up, or unavailable. */
  views30d: number | null
}

export interface PlatformDashboard {
  kind: 'platform-admin'
  tenants: TenantSummary[]
  tenantCount: number
  authorCount: number
}

/**
 * `GET /admin/v1/dashboard`
 *
 * A discriminated union, mirroring the API. Narrow on `kind` — a platform admin
 * has no tenant, so there is no author-shaped data to fall back to and the UI
 * must branch rather than render zeros.
 */
export type Dashboard = AuthorDashboard | PlatformDashboard

/* ── GET /admin/v1/dashboard/analytics ─────────────────────────────────────── */

export type AnalyticsRange = '7d' | '30d' | '90d'

export interface Delta {
  current: number
  previous: number
}

export interface TopArticle {
  articleId: string
  title: string
  slug: string
  authorName: string
  categoryName: string | null
  /** ISO 8601 UTC. */
  publishedAt: string
  views: number
  /** Views per day, aligned to `readership.daily`. */
  daily: number[]
}

export interface CategoryShare {
  /** Null = uncategorised. */
  categoryId: string | null
  name: string
  retired: boolean
  views: number
  /** Fraction of article views; the list sums to 1. */
  share: number
}

export interface AuthorActivity {
  authorId: string
  name: string
  published: number
  /** Null unless readership is ok. */
  views: number | null
}

export interface PublishingPipeline {
  ready: number
  /** Blockers overlap: a draft missing both is counted in both. */
  needsExcerpt: number
  needsCover: number
  lastPublishedAt: string | null
}

/**
 * `not-connected` and `unavailable` are NOT errors — the response is a 200 and
 * the editorial half is intact. Render it regardless.
 */
export type Readership =
  | { status: 'not-connected' | 'unavailable' }
  | {
    status: 'ok'
    views: Delta
    /** Null for contributors ("mine"). */
    visitors: Delta | null
    /** Null until an article has a complete first week in the range. */
    firstWeekViewsPerNewArticle: number | null
    /** Dense, one entry per local day. */
    daily: { date: string, views: number }[]
    topArticles: TopArticle[]
    byCategory: CategoryShare[]
    /** Null for contributors ("mine"). */
    sources: { source: string, views: number }[] | null
  }

export interface DashboardAnalytics {
  range: AnalyticsRange
  /** The viewer's IANA zone the days were cut in. */
  timezone: string
  /** "mine" for contributors: their own articles only. */
  scope: 'site' | 'mine'
  current: { from: string, to: string }
  previous: { from: string, to: string }
  editorial: {
    published: Delta
    publishedByDay: { date: string, count: number }[]
    pipeline: PublishingPipeline
  }
  /** Null for contributors. Sorted by name, deliberately unranked. */
  authors: AuthorActivity[] | null
  readership: Readership
}

/**
 * A tenant's taxonomy entry. `GET /admin/v1/categories[?include=retired]`
 *
 * `articleCount` is how many articles are filed here, any status — drafts
 * included, so an editor deciding whether to retire a section sees everything
 * that would lose it, not only what readers can see.
 */
export interface Category {
  id: string
  name: string
  /** The public URL segment, `/category/:slug`. Changing it leaves a redirect. */
  slug: string
  /** Section summary for the site page and its meta description. Often null. */
  description: string | null
  /** Ascending nav order. Retired rows keep a stale value — ignore it. */
  position: number
  articleCount: number
  /** ISO 8601 UTC. Null while live. */
  retiredAt: string | null
}

export interface CategoryList {
  /** Nav order, live first; retired ones only when `include=retired`. */
  data: Category[]
}

export interface CategoryInput {
  name: string
  slug?: string
  description?: string
}

/** PATCH semantics: omitted fields are untouched, `description: null` clears. */
export interface CategoryPatch {
  name?: string
  slug?: string
  description?: string | null
}

/** What still blocks publishing. Computed by the aggregate, never by the UI. */
export type PublishBlocker = 'excerpt' | 'coverImage'

/**
 * `?readiness=` on the article list: drafts by what blocks publishing. Blockers
 * overlap — a draft missing both appears under both. The totals match the
 * dashboard pipeline exactly, because both come from one domain rule.
 */
export type Readiness = 'ready' | 'needs-excerpt' | 'needs-cover'

export interface ArticleListItem {
  id: string
  title: string
  slug: string
  status: ArticleStatus
  excerpt: string | null
  coverImage: string | null
  /** ISO 8601 UTC. Null while never published. */
  publishedAt: string | null
  /** ISO 8601 UTC. The list is ordered by this. */
  updatedAt: string
  authorId: string
  authorName: string
  categoryId: string | null
  categoryName: string | null
  /**
   * Empty means ready to publish. Comes from the API rather than being derived
   * here — the aggregate computes it from the same fields `publish()` enforces,
   * so the hint can never promise something the API refuses.
   */
  missingToPublish: PublishBlocker[]
}

export interface ArticleDetail extends ArticleListItem {
  /** TipTap block JSON, not HTML. */
  content: unknown
}

export interface ArticleList {
  data: ArticleListItem[]
  meta: { page: number, perPage: number, total: number }
}

/** The stable, machine-readable codes this UI branches on. */
export type ApiErrorCode =
  | 'ARTICLE_MISSING_EXCERPT'
  | 'ARTICLE_MISSING_COVER_IMAGE'
  | 'ARTICLE_DUPLICATE_SLUG'
  | 'ARTICLE_SLUG_LOCKED'
  | 'ARTICLE_EMPTY_TITLE'
  | 'ARTICLE_UNSLUGGABLE_TITLE'
  | 'ARTICLE_NOT_FOUND'
  | 'CATEGORY_NOT_FOUND'
  | 'CATEGORY_NAME_EMPTY'
  | 'CATEGORY_NAME_UNSLUGGABLE'
  | 'CATEGORY_SLUG_TAKEN'
  | 'CATEGORY_ORDER_STALE'

/**
 * The single error envelope, produced by the API's exception filter.
 *
 * Branch on `code`; display `message`. Never parse the message — it is for
 * humans and is allowed to change.
 */
export interface ApiError {
  error: {
    code: ApiErrorCode | string
    message: string
    details?: Record<string, unknown>
  }
}
