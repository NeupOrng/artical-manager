import { DomainError } from '@core/shared';

/**
 * Author-management failures. Codes are the stable contract the backoffice
 * branches on; the filter maps `kind` to a status (invariant → 422, conflict →
 * 409, not-found → 404). See docs/api-conventions.md.
 */

export class AuthorNotFoundError extends DomainError {
  readonly code = 'AUTHOR_NOT_FOUND';
  readonly kind = 'not-found' as const;
  constructor(identifier: string) {
    super('Author not found.', { identifier });
  }
}

export class InvalidAuthorUsernameError extends DomainError {
  readonly code = 'AUTHOR_USERNAME_INVALID';
  readonly kind = 'invariant' as const;
  constructor(username: string) {
    super(
      'A username must be 3–64 characters of lowercase letters, digits, hyphen '
      + 'or underscore, and start with a letter or digit.',
      { username },
    );
  }
}

/**
 * Conflict rather than invariant: the request was well formed, somebody else
 * simply has the name. Kratos keeps usernames unique across the WHOLE
 * installation, so the holder may be on another site — the message never says
 * which, and never says who.
 */
export class AuthorUsernameTakenError extends DomainError {
  readonly code = 'AUTHOR_USERNAME_TAKEN';
  readonly kind = 'conflict' as const;
  constructor(username: string) {
    super('That username is already in use.', { username });
  }
}

/** Kratos keeps recovery addresses unique installation-wide, same as usernames. */
export class AuthorEmailInUseError extends DomainError {
  readonly code = 'AUTHOR_EMAIL_IN_USE';
  readonly kind = 'conflict' as const;
  constructor() {
    super('That email address already has an account.');
  }
}

/**
 * The last admin of a site may not be demoted or deactivated.
 *
 * Without this a site can lock itself out: nobody left who can invite anyone,
 * and recovery becomes a CLI task on the server.
 */
export class LastAdminError extends DomainError {
  readonly code = 'AUTHOR_LAST_ADMIN';
  readonly kind = 'conflict' as const;
  constructor() {
    super(
      'This is the last admin of this site. Make someone else an admin first, '
      + 'otherwise nobody could manage authors.',
    );
  }
}

/** Deactivating yourself would end your own session mid-request. */
export class SelfDeactivationError extends DomainError {
  readonly code = 'AUTHOR_SELF_DEACTIVATION';
  readonly kind = 'conflict' as const;
  constructor() {
    super('You cannot deactivate your own account. Ask another admin.');
  }
}

/** A deactivated author is restored first, then edited — never edited in place. */
export class AuthorDeactivatedError extends DomainError {
  readonly code = 'AUTHOR_DEACTIVATED';
  readonly kind = 'conflict' as const;
  constructor() {
    super('This author is deactivated. Reactivate them before making changes.');
  }
}

/** A new invite link is only meaningful while the first one is unused. */
export class AuthorAlreadyActiveError extends DomainError {
  readonly code = 'AUTHOR_ALREADY_ACTIVE';
  readonly kind = 'conflict' as const;
  constructor() {
    super('This author has already signed in. Send them the password-reset page instead.');
  }
}
