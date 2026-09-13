import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  ARTICLE_REPOSITORY,
  Article,
  ArticleNotFoundError,
  DuplicateSlugError,
  missingToPublishFrom,
  type ArticleRepository,
} from '@core/article';
import {
  CATEGORY_REPOSITORY,
  CategoryNotFoundError,
  type CategoryRepository,
} from '@core/category';
import {
  asArticleId,
  asAuthorId,
  asCategoryId,
  newId,
  type ArticleId,
} from '@core/shared';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAuthor } from '../../common/decorators/current-principal.decorator';
import type { AuthorPrincipal } from '../../common/principal';
import {
  ArticleDetailDto,
  ArticleListDto,
  CreateArticleDto,
  ListArticlesQuery,
  UpdateArticleDto,
} from './dto/article.dto';

/**
 * The admin article surface.
 *
 * `@CurrentAuthor()` throughout: articles are tenant-owned, so a platform admin
 * (who has no tenant) is refused here rather than silently seeing nothing.
 *
 * Every lookup is `findById(tenantId, id)`. A miss returns **404, never 403** —
 * a 403 would confirm the article exists in some other tenant, which leaks
 * across the isolation boundary. docs/tenant-isolation.md.
 */
@ApiTags('admin/articles')
@Controller('admin/v1/articles')
@UseGuards(PrincipalGuard, RoleGuard)
export class ArticlesController {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly repo: ArticleRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository,
  ) {}

  @Get()
  @Roles('contributor')
  @ApiOperation({ summary: 'List articles, any status' })
  @ApiOkResponse({ type: ArticleListDto })
  async list(
    @CurrentAuthor() author: AuthorPrincipal,
    @Query() query: ListArticlesQuery,
  ): Promise<ArticleListDto> {
    const result = await this.repo.listForAdmin(author.tenantId, {
      page: query.page,
      perPage: query.perPage,
      status: query.status,
      authorId: query.authorId,
      categoryId: query.categoryId,
      readiness: query.readiness,
      search: query.search,
    });

    return {
      data: result.data.map(item => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        status: item.status,
        excerpt: item.excerpt,
        coverImage: item.coverImage,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
        authorId: item.authorId,
        authorName: item.authorName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        // Derived from the same fields publish() checks, so the list badge and
        // the refusal can never disagree.
        missingToPublish: missingFrom(item),
      })),
      meta: { page: query.page, perPage: query.perPage, total: result.total },
    };
  }

  @Get(':articleId')
  @Roles('contributor')
  @ApiOperation({ summary: 'One article, with its body' })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiNotFoundResponse({ description: 'Missing, or belongs to another tenant.' })
  async findOne(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<ArticleDetailDto> {
    // No separate load: detail() reads the same tenant-scoped row and throws
    // ArticleNotFoundError on a miss, so a cross-tenant id still 404s.
    return this.detail(author, articleId);
  }

  @Post()
  @Roles('contributor')
  @ApiOperation({ summary: 'Create a draft' })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiConflictResponse({ description: 'Slug already used on this site.' })
  @ApiUnprocessableEntityResponse({ description: 'Empty or unsluggable title.' })
  async create(
    @CurrentAuthor() author: AuthorPrincipal,
    @Body() dto: CreateArticleDto,
  ): Promise<ArticleDetailDto> {
    await this.assertCategoryBelongsToTenant(author, dto.categoryId);

    // The aggregate decides the slug, so the derivation rule lives in one place.
    const article = Article.createDraft({
      id: newId<ArticleId>(),
      tenantId: author.tenantId,
      // Authorship comes from the SESSION, never the body. Accepting an
      // authorId here would let a contributor publish under someone else's
      // byline.
      authorId: asAuthorId(author.authorId),
      title: dto.title,
      slug: dto.slug,
      content: dto.content,
      excerpt: dto.excerpt,
      coverImage: dto.coverImage,
      categoryId: dto.categoryId ? asCategoryId(dto.categoryId) : null,
    });

    await this.assertSlugFree(author, article.slug);
    await this.repo.create(author.tenantId, article);

    return this.detail(author, article.id);
  }

  @Patch(':articleId')
  @Roles('contributor')
  @ApiOperation({ summary: 'Edit an article' })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiConflictResponse({ description: 'Slug taken, or locked by publication.' })
  async update(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('articleId', ParseUUIDPipe) articleId: string,
    @Body() dto: UpdateArticleDto,
  ): Promise<ArticleDetailDto> {
    const article = await this.load(author, articleId);

    // Only a CHANGED category is validated. The editor re-sends the article's
    // current categoryId on every save, and that category may have been retired
    // since it was chosen — validating it anyway made every such article
    // impossible to save, even for a one-word title fix (reproduced).
    const currentCategoryId = article.toProps().categoryId;
    if (dto.categoryId !== undefined && dto.categoryId !== currentCategoryId) {
      await this.assertCategoryBelongsToTenant(author, dto.categoryId);
    }

    // Every change goes through the aggregate — it enforces the empty-title and
    // published-slug rules, and it is the only thing that may touch status.
    article.edit({
      title: dto.title,
      slug: dto.slug,
      content: dto.content,
      excerpt: dto.excerpt,
      coverImage: dto.coverImage,
      categoryId:
        dto.categoryId === undefined
          ? undefined
          : dto.categoryId === null
            ? null
            : asCategoryId(dto.categoryId),
    });

    if (dto.slug !== undefined) {
      await this.assertSlugFree(author, article.slug, articleId);
    }

    await this.repo.update(author.tenantId, article);
    return this.detail(author, articleId);
  }

  /**
   * Goes live immediately. A verb on a sub-resource rather than
   * `PATCH { status }` — that keeps the transition's guards explicit and stops a
   * generic update becoming a way around the aggregate.
   *
   * `editor` and above: publishing is what a reader sees, so it is not a
   * contributor's call.
   */
  @Post(':articleId/publish')
  @Roles('editor')
  @ApiOperation({ summary: 'Publish immediately' })
  @ApiOkResponse({ type: ArticleDetailDto })
  @ApiUnprocessableEntityResponse({
    description: 'Missing excerpt or cover image — both feed the share preview.',
  })
  @ApiForbiddenResponse({ description: 'Contributors cannot publish.' })
  async publish(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<ArticleDetailDto> {
    const article = await this.load(author, articleId);

    // Throws MissingExcerptError / MissingCoverImageError → 422 via the filter.
    // Idempotent: re-publishing does not move publishedAt.
    article.publish(new Date());

    await this.repo.update(author.tenantId, article);
    return this.detail(author, articleId);
  }

  @Post(':articleId/unpublish')
  @Roles('editor')
  @ApiOperation({ summary: 'Return a published article to draft' })
  @ApiOkResponse({ type: ArticleDetailDto })
  async unpublish(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<ArticleDetailDto> {
    const article = await this.load(author, articleId);

    // publishedAt is deliberately NOT cleared — it is the canonical first
    // publication date and republishing must not move it.
    article.unpublish();

    await this.repo.update(author.tenantId, article);
    return this.detail(author, articleId);
  }

  @Delete(':articleId')
  @Roles('editor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an article' })
  @ApiNoContentResponse()
  async remove(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<void> {
    // Loaded first so a cross-tenant id 404s rather than silently deleting
    // nothing and reporting success.
    await this.load(author, articleId);
    await this.repo.delete(author.tenantId, articleId);
  }

  /**
   * Builds a single-article response by RE-READING the row.
   *
   * Deliberately not composed from the aggregate: an aggregate carries domain
   * state, not storage bookkeeping, so `updated_at`, the author's name and the
   * category name are simply not on it. Synthesising them produced a response
   * that looked right and was wrong — `updatedAt` was `new Date()`, so the
   * editor reported every article as "edited just now", and `categoryName` was
   * hardcoded null while the list showed the real one.
   *
   * One extra query per write, in exchange for a response that always matches
   * what the next reader will see.
   */
  private async detail(
    principal: AuthorPrincipal,
    articleId: string,
  ): Promise<ArticleDetailDto> {
    const row = await this.repo.findDetailById(principal.tenantId, articleId);
    // Unreachable: every caller has just loaded or written this article inside
    // the same request. A miss means it was deleted concurrently.
    if (!row) throw new ArticleNotFoundError(articleId);

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      excerpt: row.excerpt,
      coverImage: row.coverImage,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      authorId: row.authorId,
      authorName: row.authorName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      content: row.content,
      missingToPublish: missingFrom(row),
    };
  }

  /** Tenant-scoped load, or 404. Never distinguishes missing from another tenant's. */
  private async load(
    author: AuthorPrincipal,
    articleId: string,
  ): Promise<Article> {
    const article = await this.repo.findById(
      author.tenantId,
      asArticleId(articleId),
    );
    if (!article) throw new ArticleNotFoundError(articleId);
    return article;
  }

  /**
   * A categoryId arrives from the CLIENT, so it has to be proved to belong to
   * the caller's tenant before it is stored.
   *
   * The database will not do this for us: the foreign key on
   * `articles.category_id` references `categories.id` and knows nothing about
   * tenancy, so Postgres accepts another tenant's category id without
   * complaint. Verified before this check existed — a technology article
   * happily stored a gaming category and the request returned 200.
   *
   * `findById` is tenant-scoped AND excludes retired categories, so this also
   * stops an article being filed under a section that was soft-deleted.
   *
   * NOT FOUND rather than forbidden, deliberately: a 403 would confirm the id
   * exists somewhere else, which is the same leak that makes cross-tenant
   * article reads 404. docs/tenant-isolation.md.
   */
  private async assertCategoryBelongsToTenant(
    author: AuthorPrincipal,
    categoryId: string | null | undefined,
  ): Promise<void> {
    // undefined = not supplied (PATCH), null = clear it. Neither needs a check.
    if (!categoryId) return;

    const found = await this.categories.findById(
      author.tenantId,
      asCategoryId(categoryId),
    );
    if (!found) throw new CategoryNotFoundError(categoryId);
  }

  private async assertSlugFree(
    author: AuthorPrincipal,
    slug: string,
    exceptId?: string,
  ): Promise<void> {
    // Advisory only — the unique index is what actually decides, and two
    // concurrent creates can still race past this. It exists so the common case
    // is a clean 409 rather than a raw constraint violation surfacing as a 500.
    if (await this.repo.slugExists(author.tenantId, slug, exceptId)) {
      throw new DuplicateSlugError(slug);
    }
  }
}

/** Shared shape for anything the aggregate can produce. */
function missingFrom(item: {
  excerpt: string | null
  coverImage: string | null
}): ('excerpt' | 'coverImage')[] {
  // The domain's definition, not a copy of it — the same one the pipeline
  // counts and the readiness filter follow.
  return missingToPublishFrom(item);
}

