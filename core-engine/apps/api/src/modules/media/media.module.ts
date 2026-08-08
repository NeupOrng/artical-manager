import { Module } from '@nestjs/common';
import {
  MEDIA_REPOSITORY,
  OBJECT_STORAGE,
  DrizzleMediaRepository,
  S3ObjectStorage,
} from '@core/media';
import { MediaController } from './media.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Imports AuthModule for PrincipalGuard — the guard needs the author and
 * platform-admin repositories, and binding them a second time here would create
 * two provider sets for one fact.
 *
 * TENANT_REPOSITORY is no longer provided: it existed only for the interim
 * TenantContextGuard, which this controller no longer uses.
 */
@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [
    { provide: MEDIA_REPOSITORY, useClass: DrizzleMediaRepository },
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
  ],
})
export class MediaModule {}
