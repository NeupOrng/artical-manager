import { Module } from '@nestjs/common';
import {
  AUTHOR_REPOSITORY,
  PERMISSION_CHECKER,
  DrizzleAuthorRepository,
  RolePermissionChecker,
} from '@core/author';
import {
  PLATFORM_ADMIN_REPOSITORY,
  DrizzlePlatformAdminRepository,
} from '@core/platform-admin';
import { TENANT_REPOSITORY, DrizzleTenantRepository } from '@core/tenant';
import { AuthController } from './auth.controller';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

/**
 * Binds the two repositories PrincipalGuard needs, via symbol tokens declared in
 * the libs rather than by importing concrete classes at the point of use —
 * core-engine/CLAUDE.md, "Module wiring".
 *
 * The guards are exported so any module with an admin surface can apply them
 * without re-declaring these providers. They are NOT registered globally with
 * APP_GUARD on purpose: that would put PrincipalGuard in front of `/public/v1/*`
 * and `/health` too, and those routes must never see an identity header at all.
 * An opt-in guard fails visibly (a route forgets it); a global one fails
 * invisibly (a public route starts requiring auth in production only).
 */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTHOR_REPOSITORY, useClass: DrizzleAuthorRepository },
    {
      provide: PLATFORM_ADMIN_REPOSITORY,
      useClass: DrizzlePlatformAdminRepository,
    },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
    { provide: PERMISSION_CHECKER, useClass: RolePermissionChecker },
    PrincipalGuard,
    PermissionGuard,
  ],
  exports: [
    PrincipalGuard,
    PermissionGuard,
    PERMISSION_CHECKER,
    AUTHOR_REPOSITORY,
    PLATFORM_ADMIN_REPOSITORY,
  ],
})
export class AuthModule {}
