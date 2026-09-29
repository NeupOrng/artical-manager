import { Controller, Get, Inject, Logger, Query, UseGuards } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ARTICLE_REPOSITORY,
  READERSHIP_ANALYTICS,
  analyticsWindow,
  buildDashboardAnalytics,
  type ArticleRepository,
  type DashboardAnalytics,
  type ReadershipAnalytics,
} from '@core/article';
import { MEDIA_REPOSITORY, type MediaRepository } from '@core/media';
import { TENANT_REPOSITORY, type TenantRepository, type TenantWithStats } from '@core/tenant';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentAuthor, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { AuthorPrincipal, Principal } from '../../common/principal';
import { DashboardAnalyticsDto, DashboardAnalyticsQuery } from './dto/dashboard-analytics.dto';
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
@UseGuards(PrincipalGuard, PermissionGuard)
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(MEDIA_REPOSITORY) private readonly media: MediaRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(READERSHIP_ANALYTICS) private readonly readership: ReadershipAnalytics,
  ) {}

  /**
   * Readership + editorial analytics for the dashboard.
   *
   * `@CurrentAuthor()`: this is tenant data, so a platform admin is refused
   * (403) — their per-site figure is `views30d` on GET /dashboard instead.
   * Who sees what (contributor → own articles) is decided in the use case from
   * the resolved role, never from input.
   */
  @Get('dashboard/analytics')
  @RequirePermission('dashboard.read')
  @ApiOperation({
    summary: 'Readership and editorial analytics for a range, in the viewer\'s time zone',
  })
  @ApiOkResponse({ type: DashboardAnalyticsDto })
  @ApiForbiddenResponse({ description: 'Platform admins — analytics is tenant data.' })
  async analytics(
    @CurrentAuthor() author: AuthorPrincipal,
    @Query() query: DashboardAnalyticsQuery,
  ): Promise<DashboardAnalyticsDto> {
    const now = new Date();
    const tenant = await this.tenants.findById(author.tenantId);

    const result = await buildDashboardAnalytics(
      { articles: this.articles, readership: this.readership },
      {
        viewer: { tenantId: author.tenantId, authorId: author.authorId, role: author.role },
        // The website id comes from the caller's OWN tenant row — never input.
        site: tenant?.umamiWebsiteId
          ? { tenantId: author.tenantId, websiteId: tenant.umamiWebsiteId, hostname: tenant.domain }
          : null,
        window: analyticsWindow(query.range, now, query.tz),
        now,
      },
    );

    if (result.readership.status === 'unavailable') {
      this.logger.warn(`readership unavailable for tenant ${author.tenantId}: ${result.readership.cause}`);
    }

    return toAnalyticsDto(result);
  }

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
    // UTC for a cross-tenant operator view: there is no one viewer's "day"
    // across sites, and this figure is a trend check, not a chart.
    const last30 = analyticsWindow('30d', new Date(), 'UTC').current;
    const views = await Promise.all(tenants.map(t => this.views30d(t, last30)));

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
          views30d: views[tenants.indexOf(t)] ?? null,
        }),
      ),
      tenantCount: tenants.length,
      // Summed here rather than in a second query — the rows are already loaded
      // and a separate COUNT could disagree with them under concurrent writes,
      // which would show a total that does not match the list beneath it.
      authorCount: tenants.reduce((sum, t) => sum + t.authorCount, 0),
    };
  }

  /** One tenant's 30-day views, or null — a dead analytics store must not break this screen. */
  private async views30d(tenant: TenantWithStats, span: { from: Date, to: Date }): Promise<number | null> {
    if (!tenant.umamiWebsiteId) return null;
    try {
      const summary = await this.readership.summary(
        { tenantId: tenant.id, websiteId: tenant.umamiWebsiteId, hostname: tenant.domain },
        { ...span, timezone: 'UTC' },
      );
      return summary.views;
    }
    catch (error) {
      this.logger.warn(`views30d unavailable for tenant ${tenant.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
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

/** Wire shape: ISO strings, and the cause of an outage stays in the log. */
function toAnalyticsDto(a: DashboardAnalytics): DashboardAnalyticsDto {
  const r = a.readership;
  const span = (t: { from: Date, to: Date }) => ({ from: t.from.toISOString(), to: t.to.toISOString() });

  return {
    range: a.window.range,
    timezone: a.window.timezone,
    scope: a.scope,
    current: span(a.window.current),
    previous: span(a.window.previous),
    editorial: {
      published: a.editorial.published,
      publishedByDay: a.editorial.publishedByDay,
      pipeline: {
        ...a.editorial.pipeline,
        lastPublishedAt: a.editorial.pipeline.lastPublishedAt?.toISOString() ?? null,
      },
    },
    authors: a.authors,
    readership: r.status !== 'ok'
      ? { status: r.status }
      : {
          status: 'ok',
          views: r.views,
          visitors: r.visitors,
          firstWeekViewsPerNewArticle: r.firstWeekViewsPerNewArticle,
          daily: r.daily,
          topArticles: r.topArticles.map(t => ({
            articleId: t.article.id,
            title: t.article.title,
            slug: t.article.slug,
            authorName: t.article.authorName,
            categoryName: t.article.categoryName,
            publishedAt: t.article.publishedAt.toISOString(),
            views: t.views,
            daily: t.daily,
          })),
          byCategory: r.byCategory,
          sources: r.sources,
        },
  };
}
