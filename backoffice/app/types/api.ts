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

/** What still blocks publishing. Computed by the aggregate, never by the UI. */
export type PublishBlocker = 'excerpt' | 'coverImage'

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
