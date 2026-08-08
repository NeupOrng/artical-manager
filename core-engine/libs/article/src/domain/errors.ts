import { DomainError } from '@core/shared';

export class MissingExcerptError extends DomainError {
  readonly code = 'ARTICLE_MISSING_EXCERPT';
  readonly kind = 'invariant' as const;

  constructor(articleId: string) {
    super('Article needs an excerpt before it can leave draft.', { articleId });
  }
}

export class MissingCoverImageError extends DomainError {
  readonly code = 'ARTICLE_MISSING_COVER_IMAGE';
  readonly kind = 'invariant' as const;

  constructor(articleId: string) {
    super('Article needs a cover image before it can leave draft.', { articleId });
  }
}

export class ArticleNotFoundError extends DomainError {
  readonly code = 'ARTICLE_NOT_FOUND';
  readonly kind = 'not-found' as const;

  constructor(identifier: string) {
    super('Article not found.', { identifier });
  }
}

export class DuplicateSlugError extends DomainError {
  readonly code = 'ARTICLE_DUPLICATE_SLUG';
  readonly kind = 'conflict' as const;

  constructor(slug: string) {
    // Scoped to the tenant, always. Two tenants publishing /best-laptops-2026
    // is legal and expected — see the unique constraint on (tenant_id, slug).
    super('Another article on this site already uses that slug.', { slug });
  }
}

export class SlugLockedError extends DomainError {
  readonly code = 'ARTICLE_SLUG_LOCKED';
  readonly kind = 'conflict' as const;

  constructor(articleId: string) {
    super(
      'A published article\'s slug cannot change. It is a public URL that is '
      + 'already shared, indexed, and cached — unpublish first if you really '
      + 'need to change it.',
      { articleId },
    );
  }
}

export class EmptyTitleError extends DomainError {
  readonly code = 'ARTICLE_EMPTY_TITLE';
  readonly kind = 'invariant' as const;

  constructor() {
    super('An article needs a title.');
  }
}

export class UnsluggableTitleError extends DomainError {
  readonly code = 'ARTICLE_UNSLUGGABLE_TITLE';
  readonly kind = 'invariant' as const;

  constructor(title: string) {
    // A title of only punctuation or non-latin script slugifies to an empty
    // string. Silently generating `article-1` would hide that from the author;
    // asking for a slug is the honest response.
    super(
      'That title cannot be turned into a URL. Give the article a slug '
      + 'explicitly.',
      { title },
    );
  }
}
