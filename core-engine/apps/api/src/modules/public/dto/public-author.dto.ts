import { ApiProperty } from '@nestjs/swagger';
import { PublicArticleListItemDto, PublicAuthorDto } from './public-article.dto';

/**
 * An author's public page: their profile plus what they have published.
 *
 * Contact fields arrive already redacted from the author domain, per that
 * author's opt-in. This DTO makes no visibility decision — see the note at the
 * top of public-article.dto.ts.
 */
export class PublicAuthorProfileDto {
  @ApiProperty({ type: PublicAuthorDto })
  author!: PublicAuthorDto;

  @ApiProperty({
    type: [PublicArticleListItemDto],
    description: 'Published articles by this author, newest first.',
  })
  articles!: PublicArticleListItemDto[];
}
