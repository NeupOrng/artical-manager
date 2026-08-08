import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';

/**
 * The dashboard payload, as a discriminated union on `kind` — mirroring the
 * `Principal` union it is derived from.
 *
 * Two shapes rather than one with optional halves, for the same reason the
 * principal is a union: a tenant author and a platform admin are looking at
 * genuinely different screens, and a single shape with everything nullable
 * would let the UI render an author tile for a platform admin containing zero.
 * Zero is a lie there — the correct answer is "that question does not apply".
 */

export class ArticleCountsDto {
  @ApiProperty({ example: 12 })
  published!: number;

  @ApiProperty({ example: 3 })
  draft!: number;

  @ApiProperty({ example: 15 })
  total!: number;
}

export class RecentArticleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: ['draft', 'published'] })
  status!: 'draft' | 'published';

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO 8601 UTC. Null while the article has never been published.',
  })
  publishedAt!: string | null;

  @ApiProperty({ description: 'ISO 8601 UTC. What the list is ordered by.' })
  updatedAt!: string;

  @ApiProperty()
  authorName!: string;

  @ApiPropertyOptional({ nullable: true })
  categoryName!: string | null;
}

export class AuthorDashboardDto {
  @ApiProperty({ enum: ['author'] })
  kind!: 'author';

  @ApiProperty({ description: 'The site this author writes for.' })
  tenantName!: string;

  @ApiProperty({ enum: ['admin', 'editor', 'contributor'] })
  role!: 'admin' | 'editor' | 'contributor';

  @ApiProperty({ type: ArticleCountsDto, description: 'Everything in the tenant.' })
  articles!: ArticleCountsDto;

  @ApiProperty({
    type: ArticleCountsDto,
    description:
      "This author's own work. Separate from the tenant totals because a "
      + 'contributor needs to know what they left unfinished regardless of how '
      + 'the site as a whole is doing.',
  })
  mine!: ArticleCountsDto;

  @ApiProperty({ description: 'Live media rows, excluding soft-deleted.' })
  mediaCount!: number;

  @ApiProperty({ type: [RecentArticleDto], description: 'Most recently edited, any status.' })
  recent!: RecentArticleDto[];
}

export class TenantSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  domain!: string;

  @ApiProperty()
  nicheLabel!: string;

  @ApiProperty()
  authorCount!: number;

  @ApiProperty()
  publishedCount!: number;

  @ApiProperty()
  draftCount!: number;
}

export class PlatformDashboardDto {
  @ApiProperty({ enum: ['platform-admin'] })
  kind!: 'platform-admin';

  @ApiProperty({
    type: [TenantSummaryDto],
    description:
      'Every tenant, with AGGREGATE COUNTS ONLY. No article titles or content — '
      + 'a platform admin has no access to any tenant\'s content (root '
      + 'CLAUDE.md §1). Counts answer "is this site alive", which is an '
      + 'operator question, without exposing anything anyone wrote.',
  })
  tenants!: TenantSummaryDto[];

  @ApiProperty({ description: 'Number of tenants.' })
  tenantCount!: number;

  @ApiProperty({ description: 'Authors across all tenants.' })
  authorCount!: number;
}

/** Swagger cannot express a discriminated union inline; this names both arms. */
export const DASHBOARD_RESPONSE_SCHEMA = {
  oneOf: [
    { $ref: getSchemaPath(AuthorDashboardDto) },
    { $ref: getSchemaPath(PlatformDashboardDto) },
  ],
  discriminator: { propertyName: 'kind' },
};
