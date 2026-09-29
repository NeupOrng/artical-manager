import { Module } from '@nestjs/common';
import { AUTHOR_REPOSITORY, DrizzleAuthorRepository } from '@core/author';
import { AuthorsController } from './authors.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Author management. Imports AuthModule for the guards and the permission
 * checker rather than re-providing them — two modules each binding their own
 * would work and then quietly diverge.
 *
 * IDENTITY_PROVIDER is not listed: it comes from the global IdentityModule
 * (common/identity.provider.ts), because the Kratos admin client is one
 * connection for the whole app and needs config to build.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuthorsController],
  providers: [{ provide: AUTHOR_REPOSITORY, useClass: DrizzleAuthorRepository }],
})
export class AuthorsModule {}
