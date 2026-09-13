import { Module } from '@nestjs/common';
import {
  ARTICLE_REPOSITORY,
  ARTICLE_VIEW_REPOSITORY,
  DrizzleArticleRepository,
  DrizzleArticleViewRepository,
} from '@core/article';
import { AUTHOR_REPOSITORY, DrizzleAuthorRepository } from '@core/author';
import { TENANT_REPOSITORY, DrizzleTenantRepository } from '@core/tenant';
import { CATEGORY_REPOSITORY, DrizzleCategoryRepository } from '@core/category';
import { PublicCategoriesController } from './public-categories.controller';
import { PublicArticlesController } from './public-articles.controller';
import { PublicAuthorsController } from './public-authors.controller';
import { PublicViewsController } from './public-views.controller';

@Module({
  controllers: [
    PublicCategoriesController,
    PublicArticlesController,
    PublicAuthorsController,
    PublicViewsController,
  ],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
    { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
    { provide: ARTICLE_VIEW_REPOSITORY, useClass: DrizzleArticleViewRepository },
    { provide: AUTHOR_REPOSITORY, useClass: DrizzleAuthorRepository },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
  ],
})
export class PublicModule {}
