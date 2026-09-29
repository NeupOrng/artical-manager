import type { TenantId } from '@core/shared';
import type { AuthorRole } from '../domain/author';
import type { Permission } from '../domain/permissions';

export const PERMISSION_CHECKER = Symbol('PERMISSION_CHECKER');

/**
 * Who is asking. Deliberately a structural subset of the API's author principal
 * rather than that type imported: `libs/` must not depend on `apps/`
 * (core-engine/CLAUDE.md), and a checker needs nothing else.
 */
export interface PermissionSubject {
  authorId: string;
  tenantId: TenantId;
  role: AuthorRole;
}

/**
 * What is being acted on. Only the tenant today — a permission answer never
 * depends on which article or author is named, because roles are site-wide.
 *
 * It is in the signature so the relational model has somewhere to go: with Keto,
 * "can Sam edit THIS piece" is a question about a resource, and the call sites
 * would already be passing one.
 */
export interface PermissionResource {
  tenantId: TenantId;
}

/**
 * The one place authorization is decided.
 *
 * ASYNC on purpose, even though today's implementation is a table lookup: the
 * Keto implementation is a network call, and a synchronous signature now would
 * mean changing every call site later. See infrastructure/ory/keto/README.md.
 *
 * NOT tenant isolation. Isolation is enforced by repositories scoping every
 * query, so a foreign id is a 404. This answers "may this role do this at all".
 */
export interface PermissionChecker {
  can(
    subject: PermissionSubject,
    permission: Permission,
    resource: PermissionResource,
  ): Promise<boolean>;
}
