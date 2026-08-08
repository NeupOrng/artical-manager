import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, Max, MaxLength, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES, type MediaStatus } from '@core/media';

export class PresignUploadDto {
  @ApiProperty({ example: 'cover-photo.jpg' })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES })
  @IsIn(ALLOWED_CONTENT_TYPES as unknown as string[])
  contentType!: string;

  @ApiProperty({ maximum: MAX_UPLOAD_BYTES })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size!: number;
}

export class PresignUploadResponseDto {
  @ApiProperty({ description: 'PUT the file here directly from the browser' })
  uploadUrl!: string;
  @ApiProperty({ description: 'Stable public URL — no expiry. This is what og:image uses.' })
  publicUrl!: string;
  @ApiProperty() mediaId!: string;
  @ApiProperty() objectKey!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class MediaVariantDto {
  @ApiProperty() url!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiProperty() size!: number;
}

export class MediaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Original. Always valid, even while processing.' })
  url!: string;
  @ApiProperty() type!: string;
  @ApiProperty() size!: number;
  @ApiPropertyOptional({ nullable: true }) width!: number | null;
  @ApiPropertyOptional({ nullable: true }) height!: number | null;
  @ApiProperty({
    enum: ['pending', 'processing', 'ready', 'failed'],
    description:
      'pending → processing → ready | failed. `processing` is easy to omit and '
      + 'doing so breaks polling: a client that waits only while `pending` stops '
      + 'the moment the worker claims the row, and reports a half-processed '
      + 'image as finished.',
  })
  status!: MediaStatus;
  @ApiProperty({ type: Object, description: 'Keyed by variant name: og, card, thumb' })
  variants!: Record<string, MediaVariantDto>;
}

export class MediaListDto {
  @ApiProperty({ type: [MediaDto] }) data!: MediaDto[];
  @ApiProperty() meta!: { page: number; perPage: number; total: number };
}

export class ListMediaQuery {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 30, maximum: 100 })
  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  perPage: number = 30;
}
