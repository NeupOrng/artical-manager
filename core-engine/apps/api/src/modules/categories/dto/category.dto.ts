import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const SLUG = /^[a-z0-9-]+$/;
const SLUG_MESSAGE = 'slug may contain only lowercase letters, digits and hyphens';

export class ListCategoriesQuery {
  @ApiPropertyOptional({
    enum: ['retired'],
    description: 'Also return retired categories, after the live ones.',
  })
  @IsOptional()
  @IsIn(['retired'])
  include?: 'retired';
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Hardware' })
  @IsString() @MinLength(1) @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Derived from the name when omitted.', example: 'hardware' })
  @IsOptional() @IsString() @MaxLength(120)
  @Matches(SLUG, { message: SLUG_MESSAGE })
  slug?: string;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Shown on the section page and used as its meta / og:description.',
  })
  @IsOptional() @IsString() @MaxLength(300)
  description?: string;
}

/** PATCH semantics: omitted fields are untouched; `description: null` clears it. */
export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({
    description: 'Changing it moves the section URL. The old slug keeps working as a redirect.',
  })
  @IsOptional() @IsString() @MaxLength(120)
  @Matches(SLUG, { message: SLUG_MESSAGE })
  slug?: string;

  @ApiPropertyOptional({ maxLength: 300, nullable: true })
  @IsOptional() @IsString() @MaxLength(300)
  description?: string | null;
}

export class ReorderCategoriesDto {
  @ApiProperty({
    type: [String],
    description:
      'EVERY live category id, in the new order. A partial or stale list is '
      + 'refused with 409 CATEGORY_ORDER_STALE rather than guessed at.',
  })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

export class CategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Ascending nav order.' }) position!: number;
  @ApiProperty({ description: 'Articles filed here, any status.' }) articleCount!: number;
  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 UTC. Null while live.' })
  retiredAt!: string | null;
}

export class CategoryListDto {
  @ApiProperty({ type: [CategoryDto] }) data!: CategoryDto[];
}
