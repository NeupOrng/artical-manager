import { isValidUsername, normaliseUsername, type Author, type AuthorRole } from './author';
import {
  InvalidAuthorUsernameError,
  LastAdminError,
  SelfDeactivationError,
} from './errors';

/**
 * The rules about ACCESS to a site: who may lose it, who may change roles, and
 * what an author's status is. Pure — no clock, no I/O; counts and `now` are
 * passed in.
 *
 * These are business rules, NOT permissions. "Is this person an admin" is a
 * permission (domain/permissions.ts). "May the last admin be demoted" is this
 * file, and the answer is no regardless of who is asking.
 */

export type AuthorStatus = 'active' | 'invited' | 'deactivated';

/**
 * Derived, never stored — a stored status would be a second source of truth for
 * two timestamps that already say everything.
 *
 * `invited` means the account exists but has never made an authenticated
 * request, which is how an unaccepted invite looks without asking Kratos
 * whether a password exists yet.
 */
export function statusOf(author: Pick<Author, 'deactivatedAt' | 'lastSeenAt'>): AuthorStatus {
  if (author.deactivatedAt) return 'deactivated';
  return author.lastSeenAt ? 'active' : 'invited';
}

export function isActive(author: Pick<Author, 'deactivatedAt'>): boolean {
  return author.deactivatedAt === null;
}

/** Normalises then validates, so `  Mara ` and `mara` cannot become two authors. */
export function normaliseAndValidateUsername(value: string): string {
  const username = normaliseUsername(value);
  if (!isValidUsername(username)) throw new InvalidAuthorUsernameError(value);
  return username;
}

interface AdminGuardInput {
  /** The author being changed. */
  target: Pick<Author, 'id' | 'role' | 'deactivatedAt'>;
  /** Active admins of this site right now, INCLUDING the target if they are one. */
  activeAdmins: number;
}

/**
 * Refuses a change that would leave the site with no active admin.
 *
 * Counted rather than reasoned about: "is there another admin" is a question
 * only the database can answer, and it is answered immediately before the write.
 */
function assertNotLastAdmin({ target, activeAdmins }: AdminGuardInput): void {
  const targetIsActiveAdmin = target.role === 'admin' && target.deactivatedAt === null;
  if (targetIsActiveAdmin && activeAdmins <= 1) throw new LastAdminError();
}

export function assertCanChangeRole(input: AdminGuardInput & { newRole: AuthorRole }): void {
  if (input.newRole === input.target.role) return;
  if (input.newRole !== 'admin') assertNotLastAdmin(input);
}

export function assertCanDeactivate(input: AdminGuardInput & { actorId: string }): void {
  // Checked before the last-admin rule: telling a sole admin "you are the last
  // admin" when the real answer is "not yourself, ever" is a confusing message.
  if (input.actorId === input.target.id) throw new SelfDeactivationError();
  assertNotLastAdmin(input);
}
