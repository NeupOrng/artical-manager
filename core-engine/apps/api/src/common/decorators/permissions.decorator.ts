import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@core/author';

export const PERMISSION_KEY = 'permission';

/**
 * The permission an endpoint requires, checked by PermissionGuard.
 *
 * Replaces `@Roles(minimum)`: an endpoint now names what it DOES
 * (`articles.publish`), not who may do it. The mapping from roles to
 * permissions lives once, in `libs/author/src/domain/permissions.ts`, so the day
 * authorization moves to Keto (infrastructure/ory/keto/README.md) these
 * annotations do not change at all.
 *
 * Tenant isolation is separate and unaffected — repositories scope every query,
 * so another tenant's id is a 404, never a permission question.
 */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export const PLATFORM_ONLY_KEY = 'platform_only';

/**
 * For the operator's own surface. A platform admin has no tenant and therefore
 * no tenant permissions (root CLAUDE.md §5), so those routes cannot be expressed
 * as a permission and say so directly instead.
 */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);
