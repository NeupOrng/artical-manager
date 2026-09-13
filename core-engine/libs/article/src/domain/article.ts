import { slugify, type ArticleId, type AuthorId, type CategoryId, type TenantId } from '@core/shared';
import { missingToPublishFrom, type PublishBlocker } from './readiness';
import {
  EmptyTitleError,
  MissingCoverImageError,
  MissingExcerptError,
  SlugLockedError,
  UnsluggableTitleError,
} from './errors';

/** An empty TipTap document. The content column is NOT NULL. */
export const EMPTY_DOC = { type: 'doc', content: [] } as const;


// Re-exported so existing imports from @core/article keep working; the rule
// itself lives in @core/shared because categories derive slugs the same way.
export { slugify };

export type ArticleStatus = 'draft' | 'published';

export interface ArticleProps {
  id: ArticleId;
  tenantId: TenantId;
  authorId: AuthorId;
  categoryId: CategoryId | null;
  title: string;
  slug: string;
  content: unknown;
  excerpt: string | null;
  coverImage: string | null;
  status: ArticleStatus;
  publishedAt: Date | null;
}

/**
 * The Article aggregate. Every status transition goes through here — nothing
 * assigns `status` directly.
 *
 * Two states only: publishing is immediate. Scheduled auto-publish was removed
 * by decision, so there is no queue, no timer, and no future-dated state.
 *
 * `now` is still injected rather than read from the clock inside the domain —
 * that keeps `publishedAt` deterministic in tests.
 *
 * See docs/article-status-lifecycle.md.
 */
export class Article {
  private constructor(private readonly props: ArticleProps) {}

  static fromProps(props: ArticleProps): Article {
    return new Article(props);
  }

  /**
   * A new article. ALWAYS starts as a draft — there is no path that creates
   * something already public, which is what keeps "publishing is a deliberate
   * act" true rather than a convention.
   *
   * excerpt and coverImage are absent at this point by design: an author has
   * not written them yet, and `publish()` is what refuses without them.
   */
  static createDraft(input: {
    id: ArticleId
    tenantId: TenantId
    authorId: AuthorId
    title: string
    /** Omit to derive from the title. */
    slug?: string
    content?: unknown
    excerpt?: string | null
    coverImage?: string | null
    categoryId?: CategoryId | null
  }): Article {
    const title = input.title.trim();
    if (!title) throw new EmptyTitleError();

    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(title));
    if (!slug) throw new UnsluggableTitleError(input.title);

    return new Article({
      id: input.id,
      tenantId: input.tenantId,
      authorId: input.authorId,
      categoryId: input.categoryId ?? null,
      title,
      slug,
      content: input.content ?? EMPTY_DOC,
      excerpt: input.excerpt?.trim() || null,
      coverImage: input.coverImage ?? null,
      status: 'draft',
      publishedAt: null,
    });
  }

  get title(): string {
    return this.props.title;
  }
  get authorId(): AuthorId {
    return this.props.authorId;
  }

  /**
   * Editorial edits. Every field is optional — this backs a PATCH, and
   * `undefined` means "not supplied" while `null` means "clear it".
   *
   * Status is NOT here, deliberately. Transitions go through publish() and
   * unpublish() so their guards cannot be bypassed by a generic update — the
   * reason the API exposes them as verbs on sub-resources rather than as
   * PATCH { status }.
   */
  edit(changes: {
    title?: string
    slug?: string
    content?: unknown
    excerpt?: string | null
    coverImage?: string | null
    categoryId?: CategoryId | null
  }): void {
    if (changes.title !== undefined) {
      const title = changes.title.trim();
      if (!title) throw new EmptyTitleError();
      this.props.title = title;
    }

    if (changes.slug !== undefined) {
      // A published slug is a URL that is already shared, indexed by crawlers,
      // and cached in ISR pages that only revalidate on publish. Changing it
      // breaks every one of those silently, so the aggregate refuses.
      if (this.props.status === 'published') {
        throw new SlugLockedError(this.props.id);
      }
      const slug = slugify(changes.slug);
      if (!slug) throw new UnsluggableTitleError(changes.slug);
      this.props.slug = slug;
    }

    if (changes.content !== undefined) this.props.content = changes.content;
    if (changes.categoryId !== undefined) this.props.categoryId = changes.categoryId;

    // Empty string collapses to null so "cleared" and "never set" are one state
    // — publish() only has to check for falsiness, not for both.
    if (changes.excerpt !== undefined) {
      this.props.excerpt = changes.excerpt?.trim() || null;
    }
    if (changes.coverImage !== undefined) {
      this.props.coverImage = changes.coverImage || null;
    }
  }

  /**
   * What publishing still needs. Lets the UI show the requirement WHILE writing
   * rather than as a 422 at the moment someone hits publish.
   *
   * Derived from the same fields `assertShareable` checks, so the hint and the
   * enforcement cannot disagree.
   */
  missingToPublish(): PublishBlocker[] {
    return missingToPublishFrom(this.props);
  }

  get id(): ArticleId {
    return this.props.id;
  }
  get tenantId(): TenantId {
    return this.props.tenantId;
  }
  get slug(): string {
    return this.props.slug;
  }
  get status(): ArticleStatus {
    return this.props.status;
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }

  toProps(): ArticleProps {
    return { ...this.props };
  }

  /** Published content is the only thing the public surface may ever return. */
  isPublished(): boolean {
    return this.props.status === 'published';
  }

  /**
   * Goes live immediately. Idempotent — re-publishing an already-published
   * article is a no-op rather than an error, so a double click or a retried
   * request can't produce a second `publishedAt`.
   */
  publish(now: Date): void {
    this.assertShareable();

    if (this.props.status === 'published') return;

    this.props.status = 'published';
    // Set once. Unpublishing and republishing must not move the canonical date,
    // which feeds article:published_time and the public sort order.
    this.props.publishedAt ??= now;
  }

  unpublish(): void {
    if (this.props.status !== 'published') return;
    this.props.status = 'draft';
  }

  /**
   * excerpt and coverImage feed og:description and og:image. An article without
   * them cannot be shared correctly, which is the product's whole promise — so
   * they gate publishing.
   */
  private assertShareable(): void {
    if (!this.props.excerpt) throw new MissingExcerptError(this.props.id);
    if (!this.props.coverImage) throw new MissingCoverImageError(this.props.id);
  }
}
