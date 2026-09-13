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
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CATEGORY_REPOSITORY,
  CategoryNotFoundError,
  DuplicateCategorySlugError,
  applyCategoryEdit,
  isRetired,
  makeCategory,
  orderFromIds,
  type CategoryRepository,
  type CategoryWithUsage,
} from '@core/category';
import { asCategoryId, newId, type CategoryId } from '@core/shared';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { RoleGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAuthor } from '../../common/decorators/current-principal.decorator';
import type { AuthorPrincipal } from '../../common/principal';
import {
  CategoryDto,
  CategoryListDto,
  CreateCategoryDto,
  ListCategoriesQuery,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/**
 * Tenant taxonomy management.
 *
 * Reads are open to contributors — they need the picker when filing an article.
 * Writes are editor-and-above: a category slug is a public URL, and its order
 * and name are the site's navigation.
 *
 * `@CurrentAuthor()` throughout: taxonomy is tenant-owned, so a platform admin
 * (who has no tenant) is refused rather than silently seeing nothing.
 *
 * Every lookup is scoped by tenant and a miss is **404, never 403** — a 403
 * would confirm the category exists in another tenant. docs/tenant-isolation.md.
 */
@ApiTags('admin/categories')
@Controller('admin/v1/categories')
@UseGuards(PrincipalGuard, RoleGuard)
export class CategoriesController {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly repo: CategoryRepository,
  ) {}

  @Get()
  @Roles('contributor')
  @ApiOperation({ summary: 'List categories in nav order, optionally with retired ones' })
  @ApiOkResponse({ type: CategoryListDto })
  async list(
    @CurrentAuthor() author: AuthorPrincipal,
    @Query() query: ListCategoriesQuery,
  ): Promise<CategoryListDto> {
    const rows = await this.repo.listForAdmin(author.tenantId, {
      includeRetired: query.include === 'retired',
    });
    return { data: rows.map(toDto) };
  }

  @Post()
  @Roles('editor')
  @ApiOperation({ summary: 'Create a category at the end of the nav' })
  @ApiCreatedResponse({ type: CategoryDto })
  async create(
    @CurrentAuthor() author: AuthorPrincipal,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryDto> {
    const category = makeCategory({
      id: newId<CategoryId>(),
      tenantId: author.tenantId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      position: await this.repo.nextPosition(author.tenantId),
    });

    // Checked before writing so the caller gets a typed domain error rather
    // than a raw unique-violation from Postgres, which surfaces as a 500.
    const clash = await this.repo.findBySlug(author.tenantId, category.slug);
    if (clash) throw new DuplicateCategorySlugError(category.slug);

    await this.repo.create(author.tenantId, category);
    return toDto({ ...category, articleCount: 0 });
  }

  /**
   * Replaces the whole nav order. Declared before the `:categoryId` routes so
   * `reorder` can never be read as an id.
   */
  @Post('reorder')
  @Roles('editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set the nav order — every live category id, in order' })
  @ApiOkResponse({ type: CategoryListDto })
  async reorder(
    @CurrentAuthor() author: AuthorPrincipal,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<CategoryListDto> {
    const live = await this.repo.list(author.tenantId);
    // Throws CATEGORY_ORDER_STALE (409) unless the ids are exactly the live set.
    const order = orderFromIds(dto.ids, live);
    await this.repo.setPositions(author.tenantId, order);

    const fresh = await this.repo.list(author.tenantId);
    return { data: fresh.map(toDto) };
  }

  @Patch(':categoryId')
  @Roles('editor')
  @ApiOperation({ summary: 'Rename, re-describe, or move a category URL' })
  @ApiOkResponse({ type: CategoryDto })
  async update(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    const id = asCategoryId(categoryId);
    // Live only: a retired category is restored first, then edited.
    const existing = await this.repo.findById(author.tenantId, id);
    if (!existing) throw new CategoryNotFoundError(categoryId);

    const next = applyCategoryEdit(existing, {
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
    });

    if (next.slug !== existing.slug) {
      const clash = await this.repo.findBySlug(author.tenantId, next.slug);
      if (clash) throw new DuplicateCategorySlugError(next.slug);
    }

    // previousSlug makes the old URL a redirect, in the same transaction.
    await this.repo.update(author.tenantId, next, { previousSlug: existing.slug });
    return this.detail(author, id);
  }

  @Delete(':categoryId')
  @Roles('editor')
  @ApiOperation({ summary: 'Retire a category (soft delete; articles keep their label)' })
  async remove(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<{ deleted: true }> {
    const id = asCategoryId(categoryId);
    const existing = await this.repo.findById(author.tenantId, id);
    if (!existing) throw new CategoryNotFoundError(categoryId);

    // Deliberately NOT blocked on articleCount. Retiring is reversible and
    // non-destructive: filed articles keep their category_id, so restoring
    // brings everything back exactly as it was.
    await this.repo.softDelete(author.tenantId, id);
    return { deleted: true };
  }

  /**
   * A verb on a sub-resource, matching publish/unpublish. Idempotent: restoring
   * a live category returns it unchanged rather than erroring.
   */
  @Post(':categoryId/restore')
  @Roles('editor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a retired category to the end of the nav' })
  @ApiOkResponse({ type: CategoryDto })
  async restore(
    @CurrentAuthor() author: AuthorPrincipal,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ): Promise<CategoryDto> {
    const id = asCategoryId(categoryId);
    const existing = await this.repo.findByIdIncludingRetired(author.tenantId, id);
    if (!existing) throw new CategoryNotFoundError(categoryId);

    if (!isRetired(existing)) return this.detail(author, id);

    // The unique index is partial (live rows only), so a retired category's
    // slug may have been taken since it was retired. Restoring it would then
    // hit a raw constraint violation; say what happened instead.
    const clash = await this.repo.findBySlug(author.tenantId, existing.slug);
    if (clash) throw new DuplicateCategorySlugError(existing.slug);

    await this.repo.restore(author.tenantId, id, await this.repo.nextPosition(author.tenantId));
    return this.detail(author, id);
  }

  /** Re-reads the row so the response carries the real article count. */
  private async detail(author: AuthorPrincipal, id: CategoryId): Promise<CategoryDto> {
    const rows = await this.repo.listForAdmin(author.tenantId, { includeRetired: true });
    const row = rows.find(c => c.id === id);
    if (!row) throw new CategoryNotFoundError(id);
    return toDto(row);
  }
}

function toDto(c: CategoryWithUsage): CategoryDto {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    position: c.position,
    articleCount: c.articleCount,
    retiredAt: c.deletedAt?.toISOString() ?? null,
  };
}
