import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ARTICLE_REPOSITORY, type ArticleRepository } from '@core/article';
import {
  AUTHOR_REPOSITORY,
  type AuthorRepository,
  normaliseUsername,
  toPublicProfile,
} from '@core/author';
import {
  CurrentTenant,
  TenantContextGuard,
  type TenantContext,
} from '../../common/tenant-context.guard';
import { UseGuards } from '@nestjs/common';
import { PublicAuthorProfileDto } from './dto/public-author.dto';

/**
 * PUBLIC surface. No user authentication — readers are anonymous.
 * The only credential is the tenant's key, validated by Kong before this runs.
 */
@ApiTags('public/authors')
@ApiHeader({
  name: 'X-Tenant-Key',
  description: 'Tenant API key. Validated by Kong; never reaches this service.',
  required: true,
})
@Controller('public/v1/authors')
@UseGuards(TenantContextGuard)
export class PublicAuthorsController {
  constructor(
    @Inject(AUTHOR_REPOSITORY) private readonly authors: AuthorRepository,
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
  ) {}

  @Get(':username')
  @ApiOperation({ summary: "Fetch one author's public profile and published work" })
  @ApiOkResponse({ type: PublicAuthorProfileDto })
  async byUsername(
    @CurrentTenant() tenant: TenantContext,
    @Param('username') username: string,
  ): Promise<PublicAuthorProfileDto> {
    // Normalise before lookup so /author/JaneDoe and /author/janedoe resolve to
    // the same person rather than one of them 404ing.
    const author = await this.authors.findByUsername(
      tenant.tenantId,
      normaliseUsername(username),
    );

    // 404 covers two cases deliberately: no such author, and another tenant's
    // author. Distinguishing them would leak the existence of other tenants.
    if (!author) throw new NotFoundException();

    const profile = toPublicProfile(author);
    // An author with no username has no public identity. Unreachable via this
    // route since we looked them up BY username, but the projection is the
    // single source of truth for that rule and is not second-guessed here.
    if (!profile) throw new NotFoundException();

    const { data } = await this.articles.listPublished(tenant.tenantId, {
      page: 1,
      perPage: 50,
      authorUsername: profile.username,
    });

    return {
      author: profile,
      articles: data.map((a) => ({
        ...a,
        publishedAt: a.publishedAt.toISOString(),
      })),
    };
  }
}
