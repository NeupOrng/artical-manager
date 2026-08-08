import { Module } from '@nestjs/common';
import { ARTICLE_REPOSITORY, DrizzleArticleRepository } from '@core/article';
import { AUTHOR_REPOSITORY, DrizzleAuthorRepository } from '@core/author';
import { TENANT_REPOSITORY, DrizzleTenantRepository } from '@core/tenant';
import { PublicArticlesController } from './public-articles.controller';
import { PublicAuthorsController } from './public-authors.controller';

@Module({
  controllers: [PublicArticlesController, PublicAuthorsController],
  providers: [
    { provide: ARTICLE_REPOSITORY, useClass: DrizzleArticleRepository },
    { provide: AUTHOR_REPOSITORY, useClass: DrizzleAuthorRepository },
    { provide: TENANT_REPOSITORY, useClass: DrizzleTenantRepository },
  ],
})
export class PublicModule {}
