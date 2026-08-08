import { SetMetadata } from '@nestjs/common';
import type { AuthorRole } from '@core/author';

export const ROLES_KEY = 'roles';

/**
 * Minimum role required for a route. Roles are ranked: admin > editor >
 * contributor, so `@Roles('editor')` admits editors and admins.
 *
 * Ranked rather than a set, because the alternative — listing every acceptable
 * role at every endpoint — means adding a role later requires editing every
 * decorator that should have included it, and the ones you miss fail closed and
 * silently.
 */
export const Roles = (minimum: AuthorRole) => SetMetadata(ROLES_KEY, minimum);

/**
 * Marks a route as reachable only by a platform admin (tenant creation and the
 * like). Deliberately a separate decorator rather than a fourth role value:
 * platform admin is not a higher rung on the author ladder, it is a different
 * kind of principal with no tenant at all. Folding it into the ranking would
 * imply a platform admin can do anything an `admin` author can, inside a tenant
 * they have no access to.
 */
export const PLATFORM_ONLY_KEY = 'platform_only';
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);
