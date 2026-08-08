/**
 * Base class for domain errors.
 *
 * The domain throws these; a single exception filter in apps/api maps them to
 * HTTP. Controllers never throw HttpException directly.
 *
 * `code` is the stable, machine-readable string clients branch on. `message` is
 * for humans and may change. Adding a domain error without adding its mapping
 * in the exception filter is an incomplete change.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  /** Maps to an HTTP status in the filter. 422 = invariant violated, 409 = bad transition. */
  abstract readonly kind: 'invariant' | 'conflict' | 'not-found' | 'forbidden';

  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}
