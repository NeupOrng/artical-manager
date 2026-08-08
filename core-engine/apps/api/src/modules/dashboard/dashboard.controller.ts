import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ARTICLE_REPOSITORY, type ArticleRepository } from '@core/article';
import { MEDIA_REPOSITORY, type MediaRepository } from '@core/media';
import { TENANT_REPOSITORY, type TenantRepository } from '@core/tenant';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../../common/principal';
import {
  AuthorDashboardDto,
  DASHBOARD_RESPONSE_SCHEMA,
  PlatformDashboardDto,
  RecentArticleDto,
  TenantSummaryDto,
  ArticleCountsDto,
} from './dto/dashboard.dto';

/** How many rows the recent-activity list shows. */
const RECENT_LIMIT = 8;

/**
 * The first screen after login. One endpoint, two shapes, chosen by principal
 * kind rather than by a query parameter — the caller does not get to ask for the
 * other one.
 *
 * No business logic here beyond assembling reads: the controller picks a branch
 * on `kind` and maps rows to DTOs. The counting lives in SQL, where it belongs.
 */
@ApiTags('dashboard')
@ApiExtraModels(AuthorDashboardDto, PlatformDashboardDto)
@Controller('admin/v1')
@UseGuards(PrincipalGuard)
export class DashboardController {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(MEDIA_REPOSITORY) private readonly media: MediaRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
  ) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard summary for the current principal',
    description:
      'Returns an author dashboard (tenant-scoped counts and recent activity) '
      + 'or a platform dashboard (per-tenant aggregates). The shape is decided '
      + 'by the resolved principal, never by request input.',
  })
  @ApiOkResponse({ schema: DASHBOARD_RESPONSE_SCHEMA })
  @ApiForbiddenResponse({ description: 'Identity not provisioned, or deactivated.' })
  async get(
    @CurrentPrincipal() principal: Principal,
  ): Promise<AuthorDashboardDto | PlatformDashboardDto> {
    if (principal.kind === 'platform-admin') {
      return this.platformDashboard();
    }

    return this.authorDashboard(principal);
  }

  private async platformDashboard(): Promise<PlatformDashboardDto> {
    // The one deliberately unscoped read in this controller, reachable only
    // because the principal is a platform admin — they have no tenantId, so
    // none of the tenant-scoped repositories could be called for them at all.
    const tenants = await this.tenants.listAllWithStats();

    return {
      kind: 'platform-admin',
      tenants: tenants.map(
        (t): TenantSummaryDto => ({
          id: t.id,
          name: t.name,
          domain: t.domain,
          nicheLabel: t.nicheLabel,
          authorCount: t.authorCount,
          publishedCount: t.publishedCount,
          draftCount: t.draftCount,
        }),
      ),
      tenantCount: tenants.length,
      // Summed here rather than in a second query — the rows are already loaded
      // and a separate COUNT could disagree with them under concurrent writes,
      // which would show a total that does not match the list beneath it.
      authorCount: tenants.reduce((sum, t) => sum + t.authorCount, 0),
    };
  }

  private async authorDashboard(
    principal: Extract<Principal, { kind: 'author' }>,
  ): Promise<AuthorDashboardDto> {
    const { tenantId, authorId } = principal;

    // Independent reads, so issue them together rather than serially — this is
    // the first screen after login and the latency is user-visible.
    const [stats, recent, mediaCount, tenant] = await Promise.all([
      this.articles.getStats(tenantId, authorId),
      this.articles.listRecent(tenantId, RECENT_LIMIT),
      this.media.countForTenant(tenantId),
      this.tenants.findById(tenantId),
    ]);

    const counts = (c: { published: number, draft: number, total: number }): ArticleCountsDto => ({
      published: c.published,
      draft: c.draft,
      total: c.total,
    });

    return {
      kind: 'author',
      // The author's own tenant, resolved from the principal. An author whose
      // tenant row vanished is a broken FK, not a normal state — but rendering
      // an empty heading beats a 500 on the landing screen.
      tenantName: tenant?.name ?? 'Unknown site',
      role: principal.role,
      articles: counts(stats),
      mine: counts(stats.mine),
      mediaCount,
      recent: recent.map(
        (a): RecentArticleDto => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          status: a.status,
          // ISO 8601 UTC on the wire, never a local-time string —
          // docs/api-conventions.md.
          publishedAt: a.publishedAt?.toISOString() ?? null,
          updatedAt: a.updatedAt.toISOString(),
          authorName: a.authorName,
          categoryName: a.categoryName,
        }),
      ),
    };
  }
}
