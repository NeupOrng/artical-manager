import { Module } from '@nestjs/common';
import { ARTICLE_REPOSITORY, DrizzleArticleRepository } from '@core/article';
import { CATEGORY_REPOSITORY, DrizzleCategoryRepository } from '@core/category';
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
    // Needed to verify an incoming categoryId belongs to the caller's tenant.
    // The FK on articles.category_id references categories.id alone and knows
    // nothing about tenancy, so without this check the database happily accepts
    // another tenant's category.
    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
  ],
})
export class ArticlesModule {}
