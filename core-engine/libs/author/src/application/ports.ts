import type { TenantId } from '@core/shared';
import type { Author } from '../domain/author';

export const AUTHOR_REPOSITORY = Symbol('AUTHOR_REPOSITORY');

/**
 * tenantId is the FIRST and REQUIRED parameter of every method. An optional or
 * trailing tenantId makes an unscoped query a typo away rather than a compile
 * error. See core-engine/docs/tenant-isolation.md.
 */
export interface AuthorRepository {
  /**
   * Usernames collide across tenants by design — two tenants may each have an
   * `editor`. A lookup by username alone returns the wrong tenant's author and
   * appears to work indefinitely.
   */
  findByUsername(tenantId: TenantId, username: string): Promise<Author | null>;

  findById(tenantId: TenantId, authorId: string): Promise<Author | null>;

  /**
   * THE ONE DELIBERATELY UNSCOPED LOOKUP IN THIS CODEBASE.
   *
   * It takes no `tenantId` because it is what *produces* one. This runs once per
   * request, in the principal guard, before any tenant is known: the edge has
   * validated a Kratos session and told us an identity id, and this is the step
   * that turns that into "which tenant is this person in". Requiring a tenantId
   * here would be circular.
   *
   * Safe only because of two properties, both of which must hold:
   *
   *   1. `authors.kratos_identity_id` is GLOBALLY unique (a plain `.unique()`,
   *      not a tenant-leading constraint). One identity resolves to at most one
   *      author, so there is no "which tenant's row did I get" ambiguity — the
   *      exact failure the tenant-first rule exists to prevent.
   *   2. The identity id is never client-supplied. Kong strips any inbound
   *      X-Kratos-Identity-Id and Oathkeeper sets the real one. If that were
   *      ever untrue, this method would be the impersonation primitive.
   *
   * Do NOT copy this shape for anything else. Every other method on every other
   * repository takes `tenantId` first and required — see
   * docs/tenant-isolation.md. The tenant returned here is the ONLY legitimate
   * source of tenant scope for the rest of the request.
   */
  findByKratosIdentityId(identityId: string): Promise<Author | null>;
}
