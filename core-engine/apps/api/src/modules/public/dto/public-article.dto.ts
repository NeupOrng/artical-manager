import { ApiProperty } from '@nestjs/swagger';

/**
 * PUBLIC response shapes. Deliberately NOT shared with any admin DTO.
 *
 * The separation is the enforcement mechanism: with distinct classes, "someone
 * adds a field to a shared serializer and drafts start leaking" is unreachable.
 * There is no `status` or `scheduledAt` here by construction.
 * See core-engine/docs/api-conventions.md.
 *
 * AUTHOR CONTACT DETAILS — changed 2026-08-07. This file previously stated that
 * author email was absent by construction. It is now publishable, by explicit
 * decision, but ONLY for an author who set `contact_public`. That opt-in is
 * applied in the author domain (`toPublicProfile`), never here: this DTO
 * serialises an already-redacted projection and makes no visibility decision of
 * its own. Do not add a raw `email` field to this file.
 */
export class PublicAuthorDto {
  @ApiProperty({
    nullable: true,
    description: 'Square avatar rendition. Null for most authors — render a fallback.',
  })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'Public identity handle; the /author/:username segment' })
  username!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, description: 'Short editorial line' })
  quote!: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Contact address. Null unless the author opted in.',
  })
  email!: string | null;
  @ApiProperty({
    nullable: true,
    description:
      'Free text — may be an @handle or a phone number. Null unless the author opted in. Do not assume a format.',
  })
  telegram!: string | null;
}

export class PublicArticleListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Feeds og:description' }) excerpt!: string;
  @ApiProperty({ description: 'Absolute URL, ~1200x630. Feeds og:image' })
  coverImage!: string;
  @ApiProperty() publishedAt!: string;
  @ApiProperty({ nullable: true }) categorySlug!: string | null;
  @ApiProperty({ description: 'Byline. Every article has an author.' })
  authorName!: string;
  @ApiProperty({
    nullable: true,
    description: 'Null on authors with no username; the byline is then unlinked.',
  })
  authorUsername!: string | null;
}

export class PublicArticleDetailDto extends PublicArticleListItemDto {
  @ApiProperty({ description: 'TipTap block JSON, not HTML' })
  content!: unknown;
  @ApiProperty({
    type: PublicAuthorDto,
    nullable: true,
    description: 'Profile for the end-of-article byline card. Already redacted.',
  })
  author!: PublicAuthorDto | null;
}

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() perPage!: number;
  @ApiProperty() total!: number;
}

export class PublicArticleListDto {
  @ApiProperty({ type: [PublicArticleListItemDto] })
  data!: PublicArticleListItemDto[];
  @ApiProperty() meta!: PaginationMetaDto;
}
