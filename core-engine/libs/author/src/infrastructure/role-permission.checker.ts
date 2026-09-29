import { Injectable } from '@nestjs/common';
import { roleHasPermission, type Permission } from '../domain/permissions';
import type {
  PermissionChecker,
  PermissionResource,
  PermissionSubject,
} from '../application/permission-ports';

/**
 * Answers permission questions from the role on the author row — the model this
 * project actually has (root CLAUDE.md §5): a tenant match plus three ranked
 * roles.
 *
 * No I/O: the principal, including the role, was already resolved for this
 * request, so this is a table lookup. It implements an async port anyway because
 * the Keto implementation is a network call and the call sites must not change.
 *
 * Deliberately NOT where tenant isolation is enforced — repositories scope every
 * query, so another tenant's id is a 404. The tenant comparison below is a cheap
 * second assertion, not the mechanism.
 */
@Injectable()
export class RolePermissionChecker implements PermissionChecker {
  async can(
    subject: PermissionSubject,
    permission: Permission,
    resource: PermissionResource,
  ): Promise<boolean> {
    if (resource.tenantId !== subject.tenantId) return false;
    return roleHasPermission(subject.role, permission);
  }
}
