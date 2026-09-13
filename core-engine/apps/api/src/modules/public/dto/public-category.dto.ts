import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Deliberately NOT the admin CategoryDto with fields removed. `articleCount`
 * there counts drafts, and a shared shape is exactly how that leaks out later.
 */
export class PublicCategoryDto {
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'URL segment: /category/:slug' }) slug!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Section summary for the page and its meta description. Often null.',
  })
  description!: string | null;
}

export class PublicCategoryListDto {
  @ApiProperty({ type: [PublicCategoryDto], description: 'In nav order.' })
  data!: PublicCategoryDto[];
}

/**
 * `GET /public/v1/categories/:slug` — a union on `kind`.
 *
 * A redirect is reported in the BODY rather than as an HTTP 301 from the API.
 * The sites call this server-side with $fetch, which follows redirects silently:
 * a 301 here would hand the site the new category with no sign it had moved,
 * and the site could never 301 the reader's browser to the new URL.
 */
export class PublicCategoryResolutionDto {
  @ApiProperty({ enum: ['category', 'redirect'] })
  kind!: 'category' | 'redirect';

  @ApiProperty({ description: 'The current slug — for a redirect, where the section lives now.' })
  slug!: string;

  @ApiPropertyOptional({ description: 'Present when kind is "category".' })
  name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Present when kind is "category".' })
  description?: string | null;
}
