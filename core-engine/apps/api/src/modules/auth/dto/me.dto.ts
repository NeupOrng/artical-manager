import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * What the backoffice learns about the current principal.
 *
 * NOTE WHAT IS ABSENT: no kratos identity id, and no email for a tenant author
 * beyond what they already own. The identity id is an internal join key — the UI
 * has no use for it, and echoing it back puts it in browser memory, logs, and
 * error reports for nothing.
 *
 * `tenantId` IS returned, but only ever as a label for the UI to display. It is
 * never accepted back as input: every tenant-scoped query resolves the tenant
 * server-side from the principal. See docs/tenant-isolation.md.
 */
export class MeDto {
  @ApiProperty({
    enum: ['author', 'platform-admin'],
    description:
      'Which kind of principal this is. A platform admin has no tenant and no '
      + 'role, so the UI must branch on this rather than assume a tenant exists.',
  })
  kind!: 'author' | 'platform-admin';

  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Null only for author rows predating the profile feature.',
  })
  username!: string | null;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Present for tenant authors, null for platform admins.',
  })
  tenantId!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Display name of the author\'s tenant. Present for tenant authors, null '
      + 'for platform admins. Returned so the admin chrome can name the site on '
      + 'every page without a second request — the alternative is rendering a '
      + 'raw UUID in the header.',
  })
  tenantName!: string | null;

  @ApiPropertyOptional({
    enum: ['admin', 'editor', 'contributor'],
    nullable: true,
    description: 'Present for tenant authors, null for platform admins.',
  })
  role!: 'admin' | 'editor' | 'contributor' | null;
}
