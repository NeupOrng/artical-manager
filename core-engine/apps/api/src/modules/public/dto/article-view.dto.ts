import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RecordViewDto {
  @ApiProperty({ description: 'The published article that was read.' })
  @IsUUID()
  articleId!: string;

  // The reader context below feeds readership analytics only (sources,
  // language, device class). All optional: a view without them still counts.
  // The page URL and title are NOT accepted — the API derives them from the
  // article, so a caller cannot write arbitrary URLs into analytics.

  @ApiPropertyOptional({
    description: 'document.referrer when it is another site. Omit for same-site navigation.',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;

  @ApiPropertyOptional({ description: 'navigator.language, e.g. "en-US".', maxLength: 35 })
  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string;

  @ApiPropertyOptional({ description: 'Screen size, e.g. "1440x900".', example: '1440x900' })
  @IsOptional()
  @Matches(/^\d{2,5}x\d{2,5}$/)
  screen?: string;
}

export class RecordViewResponseDto {
  @ApiProperty({ description: "The article's new total, including this view." })
  total!: number;
}

/**
 * Batched on purpose: a listing grid would otherwise issue one request per
 * card. Capped so the endpoint cannot be turned into an expensive query by
 * asking for an unbounded id list.
 */
export class ViewTotalsQuery {
  @ApiProperty({
    description: 'Comma-separated article ids. Max 100.',
    example: '019fd634-e688-70a4-8147-dcc4cc89c587,019fd634-e68d-70ef-a51b-2648f476d329',
  })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  articleIds!: string[];
}

export class ViewTotalsResponseDto {
  @ApiProperty({
    description:
      'Totals keyed by article id. Articles with no views are absent, not zero.',
    example: { '019fd634-e688-70a4-8147-dcc4cc89c587': 42 },
  })
  totals!: Record<string, number>;
}
