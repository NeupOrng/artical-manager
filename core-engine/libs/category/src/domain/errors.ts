import { DomainError } from '@core/shared';

export class EmptyCategoryNameError extends DomainError {
  readonly code = 'CATEGORY_NAME_EMPTY';
  readonly kind = 'invariant' as const;
  constructor() {
    super('A category needs a name.');
  }
}

export class UnsluggableCategoryNameError extends DomainError {
  readonly code = 'CATEGORY_NAME_UNSLUGGABLE';
  readonly kind = 'invariant' as const;
  constructor(value: string) {
    // e.g. a name of only emoji or punctuation reduces to an empty slug, which
    // would produce the URL /category/ — a 404 the editor cannot diagnose.
    super('That name has no letters or digits to build a URL from.', { value });
  }
}

export class DuplicateCategorySlugError extends DomainError {
  readonly code = 'CATEGORY_SLUG_TAKEN';
  readonly kind = 'conflict' as const;
  constructor(slug: string) {
    super('Another category in this tenant already uses that URL.', { slug });
  }
}

export class CategoryNotFoundError extends DomainError {
  readonly code = 'CATEGORY_NOT_FOUND';
  readonly kind = 'not-found' as const;
  constructor(identifier: string) {
    super('Category not found.', { identifier });
  }
}

/**
 * A reorder request that is not exactly the tenant's live categories.
 *
 * A conflict (409) rather than an invariant (422): the request was valid when
 * the page loaded, and the usual cause is a colleague creating or retiring a
 * category since. The fix is to reload, not to correct the input.
 */
export class InvalidCategoryOrderError extends DomainError {
  readonly code = 'CATEGORY_ORDER_STALE';
  readonly kind = 'conflict' as const;
  constructor(details: { missing: string[]; unknown: string[]; duplicated: string[] }) {
    super(
      'The categories changed since this page loaded. Reload and reorder again.',
      details,
    );
  }
}
