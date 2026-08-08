import { Module } from '@nestjs/common';
import { ARTICLE_REPOSITORY, DrizzleArticleRepository } from '@core/article';
import { MEDIA_REPOSITORY, DrizzleMediaRepository } from '@core/media';
import { TENANT_REPOSITORY, DrizzleTenantRepository } from '@core/tenant';
import { DashboardController } from './dashboard.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Imports AuthModule for PrincipalGuard rather than re-providing it, so the
 * author/platform-admin repositories the guard depends on exist in exactly one
 * place. Two modules each binding their own AUTHOR_REPOSITORY would work and
 * then quietly diverge the first time one of them gained a decorator.
 */
@Module({
  imports: [AuthModule],
  controllers: [DashboardController],
  providers: [
    { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
    { provide: MEDIA_REPOSITORY, useClass: DrizzleMediaRepository },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
  ],
})
export class DashboardModule {}
