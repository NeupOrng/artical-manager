import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { AuthorRole, AuthorStatus } from '@core/author';

const ROLES = ['admin', 'editor', 'contributor'] as const;
const STATUSES = ['active', 'invited', 'deactivated'] as const;

export class ListAuthorsQuery {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn([...STATUSES])
  status?: AuthorStatus;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn([...ROLES])
  role?: AuthorRole;

  @ApiPropertyOptional({ description: 'Case-insensitive match on name or username.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class InviteAuthorDto {
  @ApiProperty({
    description:
      'The login identifier AND the public /author/:username segment. Lowercase '
      + 'letters, digits, hyphen, underscore. CANNOT be changed later.',
    example: 'nina-sato',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username!: string;

  @ApiProperty({ example: 'Nina Sato' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Contact address, and where a password reset is delivered. Not a credential.',
    example: 'nina@example.com',
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ROLES })
  @IsIn([...ROLES])
  role!: AuthorRole;
}

/**
 * PATCH semantics: omitted fields are untouched.
 *
 * `username` is deliberately absent. It is the login identifier and a public
 * URL, so it is fixed at creation — sending it is a 400 (`forbidNonWhitelisted`),
 * which is the honest answer rather than silently ignoring it.
 */
export class UpdateAuthorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn([...ROLES])
  role?: AuthorRole;
}

export class AuthorDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Null only on rows predating the profile feature.' })
  username!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Contact address. Published only if the author opted in.' })
  email!: string;
  @ApiProperty({ enum: ROLES }) role!: AuthorRole;

  @ApiProperty({
    enum: STATUSES,
    description:
      'invited = the account exists but has never signed in. Derived from '
      + 'lastSeenAt and deactivatedAt, never stored.',
  })
  status!: AuthorStatus;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 UTC. Recorded at most hourly.' })
  lastSeenAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601 UTC. Null while they have access.' })
  deactivatedAt!: string | null;

  @ApiProperty({
    description:
      'Whether their contact details are public. READ-ONLY here: the opt-in is '
      + "the author's own consent, so an admin cannot set it for them.",
  })
  contactPublic!: boolean;

  @ApiProperty({ description: 'Articles they have published on this site.' })
  publishedCount!: number;

  @ApiProperty({ description: 'Drafts they are holding.' })
  draftCount!: number;
}

export class AuthorListDto {
  @ApiProperty({ type: [AuthorDto], description: 'Ordered by name. Includes deactivated authors.' })
  data!: AuthorDto[];
}

export class InviteLinkDto {
  @ApiProperty({
    description:
      'Single-use link for setting a first password. Shown ONCE and never '
      + 'stored — reissue it while the invite is unaccepted.',
  })
  link!: string;

  @ApiProperty({ description: 'ISO 8601 UTC.' }) expiresAt!: string;
}

export class InvitedAuthorDto {
  @ApiProperty({ type: AuthorDto }) author!: AuthorDto;
  @ApiProperty({ type: InviteLinkDto }) invite!: InviteLinkDto;
}
