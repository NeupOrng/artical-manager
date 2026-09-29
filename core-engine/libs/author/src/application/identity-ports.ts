export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

/**
 * The login behind an author, as this application needs it.
 *
 * Kratos owns credentials — this project never stores or handles a password
 * (root CLAUDE.md §5). So "invite someone" means: create a login with NO
 * password and issue a one-time link they use to set their own.
 *
 * Implemented by `infrastructure/kratos-identity.provider.ts`, the only file
 * that knows it is Kratos.
 */

export interface IdentityTraits {
  /** The login identifier, and the public /author/:username segment. */
  username: string;
  /** Contact address, and the recovery/verification channel. */
  email: string;
  name: string;
}

export interface IssuedRecoveryLink {
  /** Single-use, expiring. Shown to the inviting admin ONCE; never stored. */
  link: string;
  expiresAt: Date;
}

/** Which field collided. Kratos enforces both installation-wide, across tenants. */
export type IdentityConflictField = 'username' | 'email';

export class IdentityConflictError extends Error {
  constructor(readonly field: IdentityConflictField) {
    super(`An account already exists with this ${field}.`);
    this.name = 'IdentityConflictError';
  }
}

/**
 * The identity service is unreachable, slow, or refused for a reason this
 * application cannot resolve. Deliberately not a DomainError: it maps to a 503,
 * not to a validation status, and it means "try again", not "you are wrong".
 */
export class IdentityUnavailableError extends Error {
  constructor(reason: string) {
    super(`Identity service unavailable: ${reason}`);
    this.name = 'IdentityUnavailableError';
  }
}

export interface IdentityProvider {
  /**
   * Creates a login with no password, so the only way in is the recovery link.
   * Throws IdentityConflictError when the username or email is taken.
   */
  create(traits: IdentityTraits): Promise<{ identityId: string }>;

  /**
   * Finds a login by username, including one that has no password yet. Used to
   * ADOPT an identity left behind when a previous invite died between creating
   * it and saving the author row.
   */
  findByUsername(username: string): Promise<{ identityId: string; email: string } | null>;

  /** Updates name / email (and with it the recovery address). Username is never changed. */
  updateTraits(identityId: string, traits: Partial<Omit<IdentityTraits, 'username'>>): Promise<void>;

  /** Inactive logins are refused at sign-in — one of the three deactivation layers. */
  setActive(identityId: string, active: boolean): Promise<void>;

  /** Ends every open session, so deactivation is immediate rather than eventual. */
  revokeSessions(identityId: string): Promise<void>;

  /** The invite: a single-use link that lets someone set their first password. */
  issueRecoveryLink(identityId: string, expiresIn: string): Promise<IssuedRecoveryLink>;

  /** Only for tests and the rollback path of a failed invite. */
  delete(identityId: string): Promise<void>;
}
