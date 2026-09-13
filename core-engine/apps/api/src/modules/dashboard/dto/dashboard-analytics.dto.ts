import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, ValidateBy, type ValidationOptions } from 'class-validator';
import { ANALYTICS_RANGES, isValidTimeZone, type AnalyticsRange } from '@core/article';

/**
 * An IANA zone the runtime knows. An unknown zone is a 400 — silently falling
 * back to UTC would shift every day boundary without anyone noticing.
 */
function IsTimeZone(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isTimeZone',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidTimeZone(value),
        defaultMessage: () => 'tz must be an IANA time zone, e.g. Asia/Phnom_Penh',
      },
    },
    options,
  );
}

export class DashboardAnalyticsQuery {
  @ApiPropertyOptional({ enum: ANALYTICS_RANGES, default: '30d' })
  @IsOptional()
  @IsIn([...ANALYTICS_RANGES])
  range: AnalyticsRange = '30d';

  @ApiPropertyOptional({
    default: 'UTC',
    example: 'Asia/Phnom_Penh',
    description:
      "The VIEWER's time zone (decision D5): it decides where each day begins. "
      + 'Stored instants are UTC regardless.',
  })
  @IsOptional()
  @IsTimeZone()
  tz = 'UTC';
}

class DeltaDto {
  @ApiProperty() current!: number;
  @ApiProperty() previous!: number;
}

class SpanDto {
  @ApiProperty({ description: 'ISO 8601 UTC.' }) from!: string;
  @ApiProperty({ description: 'ISO 8601 UTC.' }) to!: string;
}

class DayCountDto {
  @ApiProperty({ example: '2026-09-12', description: 'Local date in `timezone`.' }) date!: string;
  @ApiProperty() count!: number;
}

class DayViewsDto {
  @ApiProperty({ example: '2026-09-12', description: 'Local date in `timezone`.' }) date!: string;
  @ApiProperty() views!: number;
}

class PipelineDto {
  @ApiProperty({ description: 'Drafts with an excerpt and a cover image.' }) ready!: number;
  @ApiProperty({ description: 'Drafts without an excerpt. Overlaps needsCover.' }) needsExcerpt!: number;
  @ApiProperty({ description: 'Drafts without a cover image. Overlaps needsExcerpt.' }) needsCover!: number;
  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 UTC.' }) lastPublishedAt!: string | null;
}

class EditorialDto {
  @ApiProperty({ type: DeltaDto }) published!: DeltaDto;
  @ApiProperty({ type: [DayCountDto], description: 'Dense: one entry per day.' }) publishedByDay!: DayCountDto[];
  @ApiProperty({ type: PipelineDto }) pipeline!: PipelineDto;
}

class AuthorActivityDto {
  @ApiProperty() authorId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Published in the current window.' }) published!: number;
  @ApiPropertyOptional({ nullable: true, description: 'Null unless readership is ok.' }) views!: number | null;
}

class TopArticleDto {
  @ApiProperty() articleId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() authorName!: string;
  @ApiPropertyOptional({ nullable: true }) categoryName!: string | null;
  @ApiProperty({ description: 'ISO 8601 UTC.' }) publishedAt!: string;
  @ApiProperty() views!: number;
  @ApiProperty({ type: [Number], description: 'Views per day, aligned to readership.daily.' }) daily!: number[];
}

class CategoryShareDto {
  @ApiPropertyOptional({ nullable: true, description: 'Null = uncategorised.' }) categoryId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() retired!: boolean;
  @ApiProperty() views!: number;
  @ApiProperty({ description: 'Fraction of article views; the list sums to 1.' }) share!: number;
}

class SourceDto {
  @ApiProperty({ example: 'facebook.com' }) source!: string;
  @ApiProperty() views!: number;
}

class ReadershipDto {
  @ApiProperty({
    enum: ['ok', 'not-connected', 'unavailable'],
    description:
      'not-connected: this site has no analytics website. unavailable: the '
      + 'analytics store failed. Neither is an error — editorial figures are '
      + 'still returned, and the other fields below are absent.',
  })
  status!: 'ok' | 'not-connected' | 'unavailable';

  @ApiPropertyOptional({ type: DeltaDto }) views?: DeltaDto;
  @ApiPropertyOptional({ type: DeltaDto, nullable: true, description: 'Null in "mine" scope.' }) visitors?: DeltaDto | null;
  @ApiPropertyOptional({ nullable: true, description: 'Mean views in the first 7 days, over articles whose first week is complete.' })
  firstWeekViewsPerNewArticle?: number | null;

  @ApiPropertyOptional({ type: [DayViewsDto], description: 'Dense: one entry per day.' }) daily?: DayViewsDto[];
  @ApiPropertyOptional({ type: [TopArticleDto] }) topArticles?: TopArticleDto[];
  @ApiPropertyOptional({ type: [CategoryShareDto] }) byCategory?: CategoryShareDto[];
  @ApiPropertyOptional({ type: [SourceDto], nullable: true, description: 'Null in "mine" scope.' }) sources?: SourceDto[] | null;
}

export class DashboardAnalyticsDto {
  @ApiProperty({ enum: ANALYTICS_RANGES }) range!: AnalyticsRange;
  @ApiProperty({ example: 'Asia/Phnom_Penh' }) timezone!: string;
  @ApiProperty({ enum: ['site', 'mine'], description: '"mine" for contributors: only their own articles.' })
  scope!: 'site' | 'mine';

  @ApiProperty({ type: SpanDto }) current!: SpanDto;
  @ApiProperty({ type: SpanDto, description: 'Adjacent, and exactly as long as current.' }) previous!: SpanDto;
  @ApiProperty({ type: EditorialDto }) editorial!: EditorialDto;

  @ApiPropertyOptional({
    type: [AuthorActivityDto],
    nullable: true,
    description: 'Null for contributors. Sorted by name, deliberately unranked.',
  })
  authors!: AuthorActivityDto[] | null;

  @ApiProperty({ type: ReadershipDto }) readership!: ReadershipDto;
}
