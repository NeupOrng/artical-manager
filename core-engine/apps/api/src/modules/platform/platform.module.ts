import { Module } from '@nestjs/common';
import { AUTHOR_REPOSITORY, DrizzleAuthorRepository } from '@core/author';
import { TENANT_REPOSITORY, DrizzleTenantRepository } from '@core/tenant';
import { PlatformAuthorsController } from './platform-authors.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * The platform operator's surface. AuthModule supplies the guards and the
 * permission checker — bound once there rather than re-declared, so there is
 * one provider set per fact. Omitting it fails at BOOT, not at request time:
 * Nest cannot resolve PrincipalGuard's dependencies and the app crash-loops.
 *
 * IDENTITY_PROVIDER comes from the global IdentityModule, like AuthorsModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [PlatformAuthorsController],
  providers: [
    { provide: AUTHOR_REPOSITORY, useClass: DrizzleAuthorRepository },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
  ],
})
export class PlatformModule {}
