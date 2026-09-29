import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_CHECKER, type Permission, type PermissionChecker } from '@core/author';
import { PERMISSION_KEY, PLATFORM_ONLY_KEY } from '../decorators/permissions.decorator';
import type { AuthenticatedRequest } from './principal.guard';

/**
 * Enforces `@RequirePermission(...)`, and `@PlatformAdminOnly()` for the handful
 * of routes that belong to the operator rather than to a tenant.
 *
 * Runs after PrincipalGuard, which resolves the principal per request — so a
 * role change or a deactivation takes effect on the very next call rather than
 * whenever a token expires (root CLAUDE.md §5).
 *
 * A platform admin has no tenant and therefore no tenant permissions; they are
 * refused here with the same message the previous role guard used, so the backoffice's
 * handling of that case does not change.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PERMISSION_CHECKER) private readonly permissions: PermissionChecker,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const platformOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      PLATFORM_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Neither annotation: the route is open to any resolved principal (e.g.
    // /me, the dashboard). PrincipalGuard has already done the real work.
    if (!platformOnly && !permission) return true;

    const principal = context.switchToHttp().getRequest<AuthenticatedRequest>().principal;
    if (!principal) {
      throw new InternalServerErrorException('PermissionGuard ran before PrincipalGuard.');
    }

    if (platformOnly) {
      if (principal.kind !== 'platform-admin') {
        throw new ForbiddenException('Platform administrator access required.');
      }
      return true;
    }

    if (principal.kind !== 'author') {
      throw new ForbiddenException(
        'This endpoint operates on tenant data and requires a tenant author.',
      );
    }

    const allowed = await this.permissions.can(
      { authorId: principal.authorId, tenantId: principal.tenantId, role: principal.role },
      permission as Permission,
      { tenantId: principal.tenantId },
    );

    if (!allowed) {
      // Names the permission, not the role that would grant it: the client is
      // told what it may not do, and the role ladder stays an implementation
      // detail that Keto can replace.
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to do that.',
        details: { permission },
      });
    }

    return true;
  }
}
