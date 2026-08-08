/**
 * Response shapes from /public/v1/*.
 *
 * Hand-written on purpose, for now. The sites are deployed separately and
 * cannot import from core-engine, and no decision has been made on how types
 * cross that boundary (OpenAPI codegen vs a published package vs this).
 * The Bruno collection in /api is what keeps these honest — if you change an
 * endpoint, update both.
 */
/**
 * An author's public profile.
 *
 * `email` and `telegram` are null unless that author opted in to publishing
 * them. The redaction happens server-side in the author domain — never assume a
 * value is present, and never work around a null by fetching it elsewhere.
 */
export interface PublicAuthor {
  /** Public identity handle; the /author/:username segment. */
  username: string
  name: string
  quote: string | null
  /** Null unless the author opted in. */
  email: string | null
  /** Free text — may be an @handle or a phone number. Do not assume a format. */
  telegram: string | null
  /**
   * Square avatar rendition. Null for MOST authors — they register without
   * uploading one — so every surface renders the monogram fallback instead.
   */
  avatarUrl: string | null
}

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
  /** The byline. Every article has an author. */
  authorName: string
  /** Null on authors with no username — render the name unlinked. */
  authorUsername: string | null
}

export interface ArticleDetail extends ArticleListItem {
  /** TipTap block JSON, not HTML. */
  content: unknown
  /** Profile for the end-of-article card. Null if the author has no username. */
  author: PublicAuthor | null
}

export interface AuthorProfile {
  author: PublicAuthor
  articles: ArticleListItem[]
}

export interface Paginated<T> {
  data: T[]
  meta: { page: number, perPage: number, total: number }
}
