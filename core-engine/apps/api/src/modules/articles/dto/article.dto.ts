import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { READINESS_VALUES, type Readiness } from '@core/article';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * ADMIN article DTOs. Separate from the public ones by design — a shared
 * serializer is how an unpublished field starts leaking from a public endpoint.
 * See docs/api-conventions.md.
 */

export class ListArticlesQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Capped so a caller cannot ask for the whole table in one request.
  @Max(100)
  perPage = 20;

  @ApiPropertyOptional({ enum: ['draft', 'published'] })
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @ApiPropertyOptional({ description: 'Restrict to one author\'s own work.' })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({ description: 'Restrict to one category. Tenant-scoped like every filter.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    enum: READINESS_VALUES,
    description:
      'Drafts only, by what still blocks publishing. Blockers overlap: a draft '
      + 'missing both appears under needs-excerpt AND needs-cover. The totals '
      + 'match the dashboard pipeline exactly.',
  })
  @IsOptional()
  @IsIn(READINESS_VALUES)
  readiness?: Readiness;

  @ApiPropertyOptional({ description: 'Case-insensitive match on the title.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateArticleDto {
  @ApiProperty({ maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({
    description: 'Derived from the title when omitted. Lowercase, hyphenated.',
    maxLength: 320,
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  slug?: string;

  @ApiPropertyOptional({
    description: 'TipTap block JSON, NOT html. Defaults to an empty document.',
  })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 500, description: 'Feeds og:description.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ description: 'Absolute URL. Feeds og:image.' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

/**
 * PATCH semantics: every field optional, and an omitted field is untouched.
 *
 * `status` is deliberately absent. Transitions are verbs on sub-resources
 * (`/publish`, `/unpublish`) so the aggregate's guards cannot be bypassed by a
 * generic update — docs/api-conventions.md.
 */
export class UpdateArticleDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({
    maxLength: 320,
    description: 'Refused once published — the slug is a live public URL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  coverImage?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

export class ArticleListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: ['draft', 'published'] }) status!: 'draft' | 'published';
  @ApiPropertyOptional({ nullable: true }) excerpt!: string | null;
  @ApiPropertyOptional({ nullable: true }) coverImage!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 UTC.' })
  publishedAt!: string | null;
  @ApiProperty({ description: 'ISO 8601 UTC. The list is ordered by this.' })
  updatedAt!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty() authorName!: string;
  @ApiPropertyOptional({ nullable: true }) categoryId!: string | null;
  @ApiPropertyOptional({ nullable: true }) categoryName!: string | null;

  @ApiProperty({
    type: [String],
    enum: ['excerpt', 'coverImage'],
    description:
      'What still blocks publishing. Empty means ready. Computed by the '
      + 'aggregate so this hint can never disagree with what publish() enforces.',
  })
  missingToPublish!: ('excerpt' | 'coverImage')[];
}

/** One article, including its body. */
export class ArticleDetailDto extends ArticleListItemDto {
  @ApiProperty({ description: 'TipTap block JSON.' })
  content!: unknown;
}

export class ArticleListDto {
  @ApiProperty({ type: [ArticleListItemDto] })
  data!: ArticleListItemDto[];

  @ApiProperty()
  meta!: { page: number; perPage: number; total: number };
}
