import { isIP } from 'node:net';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ARTICLE_VIEW_REPOSITORY,
  READERSHIP_ANALYTICS,
  articlePath,
  type ArticleViewRepository,
  type ReadershipAnalytics,
} from '@core/article';
import {
  CurrentTenant,
  TenantContextGuard,
  type TenantContext,
} from '../../common/tenant-context.guard';
import {
  RecordViewDto,
  RecordViewResponseDto,
  ViewTotalsQuery,
  ViewTotalsResponseDto,
} from './dto/article-view.dto';

/**
 * PUBLIC surface. Readers are anonymous; the only credential is the tenant key,
 * validated by Kong before this runs.
 *
 * Its own collection rather than a sub-resource of `/articles/:slug`, because
 * that route already matches any string and a sibling `/articles/:id/views`
 * would be ambiguous with it.
 *
 * WHAT THIS COUNTER IS AND IS NOT — worth being honest about in the code, since
 * the number is shown to readers. It is an indicative popularity signal, not an
 * audited figure. The write endpoint is public and anonymous by necessity (the
 * tenant key must never reach a browser), so anyone willing to send repeated
 * requests can inflate it. The defences are proportionate, not absolute:
 *   - the client fires once per article per browser session, so ordinary
 *     refreshing does not inflate anything;
 *   - the article must exist, belong to this tenant, and be published;
 *   - Kong rate-limits the route.
 * If this ever needs to be trustworthy — paid placement, public rankings — it
 * needs server-side dedup and bot scoring, which is a different feature.
 *
 * READERSHIP ANALYTICS. After a view is counted it is also forwarded to Umami
 * (docs/proposals/dashboard-analytics-umami.md), fire-and-forget. The site's
 * Nitro route supplies the reader's IP and user agent as X-Reader-* headers;
 * they are trustworthy only because the tenant key never leaves a site's
 * server. They go to Umami for geo, device and bot detection and are never
 * stored or logged here.
 */
@ApiTags('public/views')
@ApiHeader({
  name: 'X-Tenant-Key',
  description: 'Tenant API key. Validated by Kong; never reaches this service.',
  required: true,
})
@Controller('public/v1/views')
@UseGuards(TenantContextGuard)
export class PublicViewsController {
  private readonly logger = new Logger(PublicViewsController.name);

  constructor(
    @Inject(ARTICLE_VIEW_REPOSITORY)
    private readonly views: ArticleViewRepository,
    @Inject(READERSHIP_ANALYTICS)
    private readonly readership: ReadershipAnalytics,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Record that a published article was read' })
  @ApiOkResponse({ type: RecordViewResponseDto })
  async record(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: RecordViewDto,
    @Headers('x-reader-ip') readerIp?: string,
    @Headers('x-reader-user-agent') readerUserAgent?: string,
  ): Promise<RecordViewResponseDto> {
    const recorded = await this.views.record(tenant.tenantId, dto.articleId);

    // 404 covers all three refusals — unknown id, another tenant's article, and
    // an unpublished one. Distinguishing them would confirm that a draft or
    // another tenant's article exists.
    if (recorded === null) throw new NotFoundException();

    // Only after the view is counted, so analytics can never hold a view the
    // authoritative log does not. Not awaited: a slow or dead Umami must not
    // add latency to — let alone fail — the reader's request.
    if (tenant.umamiWebsiteId) {
      this.readership
        .track(
          { tenantId: tenant.tenantId, websiteId: tenant.umamiWebsiteId, hostname: tenant.domain },
          {
            path: articlePath(recorded.slug),
            title: recorded.title,
            referrer: dto.referrer ?? null,
            language: dto.language,
            screen: dto.screen,
            ip: readerIp && isIP(readerIp) ? readerIp : undefined,
            userAgent: readerUserAgent?.slice(0, 512) || undefined,
          },
        )
        .catch((error: unknown) => {
          // The error carries the endpoint and cause, never the reader's data.
          this.logger.warn(
            `readership tracking failed for tenant ${tenant.tenantId}: `
            + (error instanceof Error ? error.message : 'unknown error'),
          );
        });
    }

    return { total: recorded.total };
  }

  @Get()
  @ApiOperation({ summary: 'View totals for a set of articles' })
  @ApiOkResponse({ type: ViewTotalsResponseDto })
  async totals(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ViewTotalsQuery,
  ): Promise<ViewTotalsResponseDto> {
    return {
      totals: await this.views.totalsFor(tenant.tenantId, query.articleIds),
    };
  }
}
