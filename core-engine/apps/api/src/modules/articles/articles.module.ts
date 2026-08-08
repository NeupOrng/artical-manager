import { Module } from '@nestjs/common';
import { ARTICLE_REPOSITORY, DrizzleArticleRepository } from '@core/article';
import { ArticlesController } from './articles.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * AuthModule supplies PrincipalGuard, RoleGuard, and AUTHOR_REPOSITORY — bound
 * once there rather than re-declared here, so there is one provider set per
 * fact.
 */
@Module({
  imports: [AuthModule],
  controllers: [ArticlesController],
  providers: [
    { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
  ],
})
export class ArticlesModule {}
