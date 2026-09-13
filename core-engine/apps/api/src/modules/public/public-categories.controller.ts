import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiOkResponse, ApiHeader, ApiNotFoundResponse } from '@nestjs/swagger';
import {
  CATEGORY_REPOSITORY,
  CategoryNotFoundError,
  type CategoryRepository,
} from '@core/category';
import {
  CurrentTenant,
  TenantContextGuard,
  type TenantContext,
} from '../../common/tenant-context.guard';
import {
  PublicCategoryListDto,
  PublicCategoryResolutionDto,
} from './dto/public-category.dto';

/** The longest slug a category can hold. Anything longer cannot resolve. */
const MAX_SLUG = 120;

/**
 * PUBLIC taxonomy, for site navigation and section pages.
 *
 * Retired categories are excluded everywhere here — `list()` and
 * `resolveSlug()` both filter `deleted_at IS NULL`.
 */
@ApiTags('public/categories')
@ApiHeader({
  name: 'X-Tenant-Key',
  description: 'Tenant API key. Validated by Kong; never reaches this service.',
  required: true,
})
@Controller('public/v1/categories')
@UseGuards(TenantContextGuard)
export class PublicCategoriesController {
  constructor(
    @Inject(CATEGORY_REPOSITORY) private readonly repo: CategoryRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the calling tenant\'s live categories, in nav order' })
  @ApiOkResponse({ type: PublicCategoryListDto })
  async list(@CurrentTenant() tenant: TenantContext): Promise<PublicCategoryListDto> {
    const rows = await this.repo.list(tenant.tenantId);

    // articleCount counts every status, so it must NOT be exposed here — it
    // would leak how many drafts a tenant is sitting on. Separate DTO, not a
    // filtered version of the admin one. docs/api-conventions.md.
    return {
      data: rows.map(c => ({ name: c.name, slug: c.slug, description: c.description })),
    };
  }

  /**
   * What `/category/:slug` should do: render a live section, redirect to where a
   * renamed one lives now, or 404.
   *
   * Before this existed the sites rendered any slug at all as an empty section
   * page with a 200 — `/category/no-such-section` included — and titled it from
   * the slug rather than the category's real name.
   */
  @Get(':slug')
  @ApiOperation({ summary: 'Resolve a section slug: the live category, or where it moved' })
  @ApiOkResponse({ type: PublicCategoryResolutionDto })
  @ApiNotFoundResponse({ description: 'No live category and no redirect for that slug.' })
  async resolve(
    @CurrentTenant() tenant: TenantContext,
    @Param('slug') raw: string,
  ): Promise<PublicCategoryResolutionDto> {
    // Normalised the way slugs are stored, so /category/Reviews finds `reviews`
    // rather than becoming a second, empty page.
    const slug = raw.trim().toLowerCase();
    if (!slug || slug.length > MAX_SLUG) throw new CategoryNotFoundError(slug);

    const result = await this.repo.resolveSlug(tenant.tenantId, slug);
    if (!result) throw new CategoryNotFoundError(slug);

    return result.kind === 'category'
      ? {
          kind: 'category',
          slug: result.category.slug,
          name: result.category.name,
          description: result.category.description,
        }
      : { kind: 'redirect', slug: result.slug };
  }
}
