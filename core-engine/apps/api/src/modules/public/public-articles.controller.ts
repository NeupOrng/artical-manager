import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiHeader, ApiOkResponse } from '@nestjs/swagger';
import { ARTICLE_REPOSITORY, type ArticleRepository } from '@core/article';
import { Inject } from '@nestjs/common';
import {
  CurrentTenant,
  TenantContextGuard,
  type TenantContext,
} from '../../common/tenant-context.guard';
import { ListArticlesQuery } from './dto/list-articles.query';
import {
  PublicArticleDetailDto,
  PublicArticleListDto,
} from './dto/public-article.dto';

/**
 * PUBLIC surface. No user authentication — readers are anonymous.
 * The only credential is the tenant's key, validated by Kong before this runs.
 *
 * Everything here returns published content only, enforced in SQL.
 */
@ApiTags('public/articles')
@ApiHeader({
  name: 'X-Tenant-Key',
  description: 'Tenant API key. Validated by Kong; never reaches this service.',
  required: true,
})
@Controller('public/v1/articles')
@UseGuards(TenantContextGuard)
export class PublicArticlesController {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List published articles for the calling tenant' })
  @ApiOkResponse({ type: PublicArticleListDto })
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListArticlesQuery,
  ): Promise<PublicArticleListDto> {
    const { data, total } = await this.articles.listPublished(tenant.tenantId, {
      page: query.page,
      perPage: query.perPage,
      categorySlug: query.categorySlug,
    });

    return {
      data: data.map((a) => ({ ...a, publishedAt: a.publishedAt.toISOString() })),
      meta: { page: query.page, perPage: query.perPage, total },
    };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Fetch one published article by slug' })
  @ApiOkResponse({ type: PublicArticleDetailDto })
  async bySlug(
    @CurrentTenant() tenant: TenantContext,
    @Param('slug') slug: string,
  ): Promise<PublicArticleDetailDto> {
    const article = await this.articles.findPublishedBySlug(tenant.tenantId, slug);

    // 404 covers three cases deliberately: no such slug, another tenant's
    // article, and an unpublished one. Distinguishing them would leak.
    if (!article) throw new NotFoundException();

    return { ...article, publishedAt: article.publishedAt.toISOString() };
  }
}
