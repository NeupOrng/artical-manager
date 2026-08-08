/**
 * Response shapes from /public/v1/*.
 *
 * Hand-written on purpose, for now. The sites are deployed separately and
 * cannot import from core-engine, and no decision has been made on how types
 * cross that boundary (OpenAPI codegen vs a published package vs this).
 * The Bruno collection in /api is what keeps these honest — if you change an
 * endpoint, update both.
 */
export interface ArticleListItem {
  id: string
  title: string
  slug: string
  /** Feeds og:description. Mandatory on anything published. */
  excerpt: string
  /** Absolute URL, ~1200x630. Feeds og:image. */
  coverImage: string
  publishedAt: string
  categorySlug: string | null
}

export interface ArticleDetail extends ArticleListItem {
  /** Full profile, so the end-of-article card needs no extra round trip. */
  author: PublicAuthor
  /** TipTap block JSON, not HTML. */
  content: unknown
  authorName: string
  /** Handle for /author/:username. Present on list items and detail alike. */
  authorUsername: string
  /** Square avatar, or null. Null is common — render the monogram fallback. */
  authorAvatarUrl: string | null
}

export interface PublicAuthor {
  /** Public identity handle; the /author/:username segment. */
  username: string
  name: string
  quote: string | null
  /** Null unless the author opted in via contact_public. */
  email: string | null
  /** Free text — may be an @handle or a phone number. Do not assume a format. */
  telegram: string | null
  /**
   * Square avatar rendition. Null for MOST authors — they register without
   * uploading one — so every surface renders the monogram fallback instead.
   */
  avatarUrl: string | null
}

export interface AuthorProfile {
  author: PublicAuthor
  articles: ArticleListItem[]
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number, perPage: number, total: number }
}
