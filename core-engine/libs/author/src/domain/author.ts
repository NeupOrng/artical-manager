import type { TenantId } from '@core/shared';

/**
 * Author is a thin context by design — see core-engine/CLAUDE.md, "Intentional
 * asymmetry". There is no aggregate here and there should not be one: an author
 * profile has no state machine, so manufacturing transitions for a handful of
 * columns costs future readers more than it returns.
 *
 * What DOES live here is the one rule that must hold identically wherever a
 * profile is written: what a username is allowed to be. That is a real invariant
 * because the username ends up in a public URL.
 */

export type AuthorRole = 'admin' | 'editor' | 'contributor';

export interface Author {
  id: string;
  tenantId: TenantId;
  /**
   * The Kratos login behind this author. Internal: it identifies the account to
   * the identity service and must never appear on a public or admin DTO.
   */
  kratosIdentityId: string;
  /** Public identity handle. Null only on rows predating the profile feature. */
  username: string | null;
  name: string;
  /** Contact address. NOT a login identity — see schema/authors.ts. */
  email: string;
  quote: string | null;
  telegram: string | null;
  contactPublic: boolean;
  role: AuthorRole;
  /** Resolved by the repository from `avatar_media_id`. Usually null. */
  avatarUrl: string | null;
  /**
   * Set when access was withdrawn; null while active. PrincipalGuard refuses a
   * deactivated author, and public surfaces hide them. See domain/access.ts.
   */
  deactivatedAt: Date | null;
  /** Last authenticated request. Null means an invite that was never accepted. */
  lastSeenAt: Date | null;
}

/**
 * What the public may see. Contact details are present only when the author
 * opted in — the decision is made here, once, rather than at each call site.
 */
export interface PublicAuthorProfile {
  username: string;
  name: string;
  quote: string | null;
  email: string | null;
  telegram: string | null;
  /**
   * Resolved square rendition, or null. Null is the COMMON case, not an edge
   * one — authors arrive via Kratos registration having uploaded nothing — so
   * every surface must carry a fallback rather than a broken image.
   */
  avatarUrl: string | null;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 64;

/**
 * Lowercase letters, digits, hyphen and underscore. Deliberately narrow: this
 * value is a public URL segment, so anything needing percent-encoding is a
 * problem, and a case-sensitive handle makes `/author/Jane` and `/author/jane`
 * two different pages.
 */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidUsername(value: string): boolean {
  return (
    value.length >= USERNAME_MIN
    && value.length <= USERNAME_MAX
    && USERNAME_PATTERN.test(value)
  );
}

/**
 * Normalises before validating so `  JaneDoe ` and `janedoe` cannot become two
 * separate authors within one tenant.
 */
export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Exactly what the projection below needs — nothing more. Narrow on purpose:
 * a caller reading these columns off a join should not have to invent an `id`
 * or a `role` it does not have just to satisfy a parameter type.
 */
export type AuthorProfileFields = Pick<
  Author,
  | 'username'
  | 'name'
  | 'email'
  | 'quote'
  | 'telegram'
  | 'contactPublic'
  | 'avatarUrl'
>;

/**
 * Projects an author to what a reader is allowed to see.
 *
 * Contact fields collapse to null unless `contactPublic` is set. This is THE
 * enforcement point, and the reason it lives in the domain rather than in a
 * controller: every public surface serialises whatever this returns, so no
 * caller can opt an author in by asking differently.
 *
 * Returns null when the author has no username — they have no public identity
 * and therefore no public profile.
 */
export function toPublicProfile(
  author: AuthorProfileFields,
): PublicAuthorProfile | null {
  if (!author.username) return null;

  return {
    username: author.username,
    name: author.name,
    quote: author.quote,
    email: author.contactPublic ? author.email : null,
    telegram: author.contactPublic ? author.telegram : null,
    // Not gated on contactPublic: an avatar is a byline, not contact
    // information. The opt-in exists so an author's address isn't published,
    // and a face they uploaded for their byline isn't that.
    avatarUrl: author.avatarUrl ?? null,
  };
}
