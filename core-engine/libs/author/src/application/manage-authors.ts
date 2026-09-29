import { newId, type TenantId } from '@core/shared';
import type { AuthorRole } from '../domain/author';
import {
  assertCanChangeRole,
  assertCanDeactivate,
  isActive,
  normaliseAndValidateUsername,
  statusOf,
} from '../domain/access';
import {
  AuthorAlreadyActiveError,
  AuthorDeactivatedError,
  AuthorEmailInUseError,
  AuthorNotFoundError,
  AuthorUsernameTakenError,
} from '../domain/errors';
import type { AuthorChanges, AuthorRepository } from './ports';
import {
  IdentityConflictError,
  type IdentityProvider,
  type IssuedRecoveryLink,
} from './identity-ports';

/**
 * Author management: invite, edit, deactivate, reactivate.
 *
 * Every one of these spans TWO systems — our database and the identity service —
 * so the order of writes is the interesting part, and each function is written
 * so that a retry after a failure repairs rather than duplicates.
 *
 * Permissions are not checked here: the transport layer does that
 * (`@RequirePermission('authors.invite')`). What lives here are the rules that
 * hold whoever is asking — see domain/access.ts.
 */

/** How long an invite link stays usable. Long enough for a working day to pass. */
export const INVITE_TTL = '72h';

export interface AuthorManagementDeps {
  authors: AuthorRepository;
  identities: IdentityProvider;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

/**
 * Creates a login with no password plus the author row, and returns a one-time
 * link the new author uses to set their own password.
 *
 * ORDER: identity first, then our row. The reverse would leave an author who can
 * never log in and whose username is taken by nothing. This way a failure leaves
 * an ORPHAN LOGIN, which the next attempt adopts (below) — recoverable by simply
 * trying again, which is what an admin will do.
 */
export async function inviteAuthor(
  deps: AuthorManagementDeps,
  input: {
    tenantId: TenantId;
    username: string;
    name: string;
    email: string;
    role: AuthorRole;
  },
): Promise<{ authorId: string; invite: IssuedRecoveryLink }> {
  const username = normaliseAndValidateUsername(input.username);
  const email = normaliseEmail(input.email);
  const name = input.name.trim();

  // Checked here for a clean error; the unique index is what actually decides.
  if (await deps.authors.existsWithUsername(input.tenantId, username)) {
    throw new AuthorUsernameTakenError(username);
  }

  let identityId: string;
  try {
    ({ identityId } = await deps.identities.create({ username, email, name }));
  }
  catch (error) {
    if (!(error instanceof IdentityConflictError)) throw error;
    if (error.field === 'email') throw new AuthorEmailInUseError();

    // The username exists in the identity service but not in this site's rows.
    // Either somebody else genuinely holds it (identities are unique across the
    // whole installation, including other sites), or a previous invite died
    // after creating the login. Adopt only in the second case.
    const existing = await deps.identities.findByUsername(username);
    if (!existing) throw new AuthorUsernameTakenError(username);

    const claimed = await deps.authors.findByKratosIdentityId(existing.identityId);
    if (claimed) throw new AuthorUsernameTakenError(username);
    identityId = existing.identityId;
  }

  const authorId = newId<string>();
  await deps.authors.create(input.tenantId, {
    id: authorId,
    kratosIdentityId: identityId,
    username,
    name,
    email,
    role: input.role,
  });

  // Last: a link issued before the row existed would let someone set a password
  // for an account the API does not recognise, which is a 403 they cannot fix.
  const invite = await deps.identities.issueRecoveryLink(identityId, INVITE_TTL);
  return { authorId, invite };
}

/** A fresh link, while the first invite is still unaccepted. */
export async function reissueInvite(
  deps: AuthorManagementDeps,
  input: { tenantId: TenantId; authorId: string },
): Promise<IssuedRecoveryLink> {
  const author = await deps.authors.findById(input.tenantId, input.authorId);
  if (!author) throw new AuthorNotFoundError(input.authorId);

  const status = statusOf(author);
  if (status === 'deactivated') throw new AuthorDeactivatedError();
  // Once they have signed in, a recovery link is a password reset, which is
  // theirs to start from the login page — not something an admin hands out.
  if (status === 'active') throw new AuthorAlreadyActiveError();

  return deps.identities.issueRecoveryLink(author.kratosIdentityId, INVITE_TTL);
}

/**
 * Edits name, email or role. Username is never editable — it is the login
 * identifier and a public URL.
 *
 * ORDER: identity first for the traits it owns (email is the recovery address),
 * then our row. A failure in between leaves the identity ahead of us, and a
 * retry re-applies both: the identity update is idempotent.
 */
export async function updateAuthor(
  deps: AuthorManagementDeps,
  input: {
    tenantId: TenantId;
    actorId: string;
    authorId: string;
    changes: AuthorChanges;
  },
): Promise<void> {
  const author = await deps.authors.findById(input.tenantId, input.authorId);
  if (!author) throw new AuthorNotFoundError(input.authorId);
  if (!isActive(author)) throw new AuthorDeactivatedError();

  const name = input.changes.name?.trim();
  const email = input.changes.email ? normaliseEmail(input.changes.email) : undefined;
  const role = input.changes.role;

  if (role && role !== author.role) {
    assertCanChangeRole({
      target: author,
      activeAdmins: await deps.authors.countActiveAdmins(input.tenantId),
      newRole: role,
    });
  }

  const traits: { name?: string; email?: string } = {};
  if (name && name !== author.name) traits.name = name;
  if (email && email !== author.email) traits.email = email;

  if (Object.keys(traits).length > 0) {
    try {
      await deps.identities.updateTraits(author.kratosIdentityId, traits);
    }
    catch (error) {
      if (error instanceof IdentityConflictError) throw new AuthorEmailInUseError();
      throw error;
    }
  }

  await deps.authors.update(input.tenantId, input.authorId, {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(role ? { role } : {}),
  });
}

/**
 * Withdraws access, in three layers.
 *
 * ORDER: our row FIRST, because that is what the API checks on the very next
 * request — the person is locked out immediately even if the identity service is
 * slow or down. The identity steps then follow and are idempotent, so a retry
 * after a failure completes them. That is also why an already-deactivated author
 * does not return early: the retry is how the login gets disabled.
 */
export async function deactivateAuthor(
  deps: AuthorManagementDeps,
  input: { tenantId: TenantId; actorId: string; authorId: string; now: Date },
): Promise<void> {
  const author = await deps.authors.findById(input.tenantId, input.authorId);
  if (!author) throw new AuthorNotFoundError(input.authorId);

  if (isActive(author)) {
    assertCanDeactivate({
      target: author,
      actorId: input.actorId,
      activeAdmins: await deps.authors.countActiveAdmins(input.tenantId),
    });
    await deps.authors.setDeactivated(input.tenantId, input.authorId, input.now);
  }

  await deps.identities.setActive(author.kratosIdentityId, false);
  // Last, so an open session cannot outlive the flag above.
  await deps.identities.revokeSessions(author.kratosIdentityId);
}

/** Restores access. Sessions are not restored — they sign in again. */
export async function reactivateAuthor(
  deps: AuthorManagementDeps,
  input: { tenantId: TenantId; authorId: string },
): Promise<void> {
  const author = await deps.authors.findById(input.tenantId, input.authorId);
  if (!author) throw new AuthorNotFoundError(input.authorId);

  if (!isActive(author)) {
    await deps.authors.setDeactivated(input.tenantId, input.authorId, null);
  }
  await deps.identities.setActive(author.kratosIdentityId, true);
}
