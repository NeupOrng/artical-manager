import type { TenantId } from '@core/shared';
import type { AuthorRole } from '@core/author';

/**
 * Who is making this request, resolved per request by PrincipalGuard.
 *
 * A DISCRIMINATED UNION, not one interface with optional fields, and that choice
 * is doing real work:
 *
 *   - `AuthorPrincipal` has a `tenantId`; `PlatformAdminPrincipal` does not.
 *     Not "has null" — does not have the property at all. So a platform admin
 *     cannot be passed to a tenant-scoped repository, because there is no
 *     `tenantId` to read off them and `principal.tenantId` does not typecheck
 *     until the code has narrowed on `kind`.
 *
 *   - The alternative — one shape with `tenantId?: TenantId` — makes the unsafe
 *     call compile. It fails at runtime as `eq(table.tenant_id, undefined)`,
 *     which Drizzle turns into SQL matching nothing, so the symptom is an EMPTY
 *     RESULT rather than an error. An empty list reads as "no articles yet" and
 *     can survive review. See libs/database/src/schema/platform-admins.ts.
 *
 * The union is therefore the mechanism that makes "a platform admin has no
 * tenant" a compile-time fact instead of a convention.
 */

export interface AuthorPrincipal {
  kind: 'author';
  authorId: string;
  /**
   * The only legitimate source of tenant scope for the request. Never read a
   * tenant from a body, query, path, or header — docs/tenant-isolation.md.
   */
  tenantId: TenantId;
  role: AuthorRole;
  /** Null only on rows predating the profile feature. */
  username: string | null;
  name: string;
}

export interface PlatformAdminPrincipal {
  kind: 'platform-admin';
  platformAdminId: string;
  username: string;
  name: string;
  // Deliberately no tenantId and no role. See above.
}

export type Principal = AuthorPrincipal | PlatformAdminPrincipal;

/**
 * Narrowing helper so call sites read as an intent check rather than a string
 * comparison against a magic literal.
 */
export const isAuthor = (p: Principal): p is AuthorPrincipal =>
  p.kind === 'author';

export const isPlatformAdmin = (p: Principal): p is PlatformAdminPrincipal =>
  p.kind === 'platform-admin';
