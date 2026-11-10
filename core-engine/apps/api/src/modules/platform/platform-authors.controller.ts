import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AUTHOR_REPOSITORY,
  IDENTITY_PROVIDER,
  inviteAuthor,
  type AuthorRepository,
  type AuthorWithUsage,
  type IdentityProvider,
} from '@core/author';
import { TENANT_REPOSITORY, type TenantRepository } from '@core/tenant';
import { asTenantId, type TenantId } from '@core/shared';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PlatformAdminOnly } from '../../common/decorators/permissions.decorator';
import { AuthorDto, AuthorListDto, InviteAuthorDto, InvitedAuthorDto } from
  '../authors/dto/author.dto';
import { PlatformTenantListDto } from './dto/platform-tenant.dto';

/**
 * The operator's surface for onboarding authors into ANY site.
 *
 * WHY THIS EXISTS SEPARATELY FROM `/admin/v1/authors`
 *
 * Decision A3 (2026-09-14) gave author management to site admins only, and the
 * invite flow was built around "the site comes from the SESSION, never the
 * body". A platform admin has no session tenant at all — `Principal` is a
 * discriminated union precisely so `.tenantId` does not compile for them — so
 * they cannot use that endpoint, and making `tenantId` an optional body field
 * there would turn its one hard rule into a conditional.
 *
 * Revised 2026-11-10: platform admins may also onboard, for any site. A
 * SEPARATE controller rather than an overload keeps both rules literally true:
 *
 *   /admin/v1/authors            tenant from the session, body cannot override
 *   /admin/v1/platform/...       tenant named in the PATH, platform admins only
 *
 * An author principal cannot reach this controller at all — `@PlatformAdminOnly`
 * refuses them before any handler runs — so "tenancy is never chosen in the UI"
 * still holds everywhere a tenant author can go. Choosing a site is the whole
 * job here, and the operator is cross-tenant by definition (root CLAUDE.md §5).
 *
 * NESTED UNDER `/admin/v1` ON PURPOSE. Oathkeeper's rules match
 * `/admin/v1/<.*>`, so this inherits the session validation that path already
 * proves. A new top-level prefix would need its own Oathkeeper rule and Kong
 * route — two more places to get authentication wrong, and this codebase
 * already carries a scar from exactly that (see media.controller.ts).
 *
 * The use case is shared, not copied: `inviteAuthor` always took `tenantId` as
 * a parameter. Only the source differs.
 */
@ApiTags('platform/authors')
@Controller('admin/v1/platform')
@UseGuards(PrincipalGuard, PermissionGuard)
@PlatformAdminOnly()
export class PlatformAuthorsController {
  constructor(
    @Inject(AUTHOR_REPOSITORY) private readonly authors: AuthorRepository,
    @Inject(IDENTITY_PROVIDER) private readonly identities: IdentityProvider,
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
  ) {}

  @Get('tenants')
  @ApiOperation({
    summary: 'Every site, for choosing one',
    description:
      'The operator picks a site before acting on it. Deliberately unscoped — '
      + 'the one read that is legitimate because the caller has no tenant of '
      + 'their own and selecting one is the point.',
  })
  @ApiOkResponse({ type: PlatformTenantListDto })
  async tenants_(): Promise<PlatformTenantListDto> {
    const rows = await this.tenants.listAllWithStats();
    return {
      data: rows.map(t => ({
        id: t.id,
        name: t.name,
        domain: t.domain,
        nicheLabel: t.nicheLabel,
        authorCount: t.authorCount,
      })),
    };
  }

  @Get('tenants/:tenantId/authors')
  @ApiOperation({
    summary: "Everyone with access to a given site",
    description:
      'The operator view of one site\'s people. Same data a site admin sees for '
      + 'their own site, reached by naming the site instead of being in it.',
  })
  @ApiOkResponse({ type: AuthorListDto })
  @ApiNotFoundResponse({ description: 'No such site.' })
  @ApiForbiddenResponse({ description: 'Platform administrator access required.' })
  async list(
    @Param('tenantId', ParseUUIDPipe) tenantIdParam: string,
  ): Promise<AuthorListDto> {
    const tenantId = await this.requireTenant(tenantIdParam);
    const rows = await this.authors.listForAdmin(tenantId);
    return { data: rows.map(toDto) };
  }

  @Post('tenants/:tenantId/authors')
  @ApiOperation({
    summary: 'Onboard an author into a given site',
    description:
      'Creates a login with NO password and returns a single-use link for '
      + 'setting one. Use this to bootstrap a new site\'s first admin — after '
      + 'that the site\'s own admins can invite the rest themselves.',
  })
  @ApiCreatedResponse({ type: InvitedAuthorDto })
  @ApiNotFoundResponse({ description: 'No such site.' })
  @ApiConflictResponse({
    description: 'Username taken, or that email already has an account.',
  })
  @ApiServiceUnavailableResponse({ description: 'The identity service did not respond. Retry.' })
  async invite(
    @Param('tenantId', ParseUUIDPipe) tenantIdParam: string,
    @Body() dto: InviteAuthorDto,
  ): Promise<InvitedAuthorDto> {
    const tenantId = await this.requireTenant(tenantIdParam);

    const { authorId, invite } = await inviteAuthor(
      { authors: this.authors, identities: this.identities },
      {
        // From the PATH, which is the one legitimate case: the operator has no
        // tenant of their own, and picking the site is the point of the call.
        tenantId,
        username: dto.username,
        name: dto.name,
        email: dto.email,
        role: dto.role,
      },
    );

    const rows = await this.authors.listForAdmin(tenantId);
    const row = rows.find(a => a.id === authorId);
    if (!row) throw new NotFoundException();

    return {
      author: toDto(row),
      invite: { link: invite.link, expiresAt: invite.expiresAt.toISOString() },
    };
  }

  /**
   * 404 for an unknown site rather than letting the id flow into a query that
   * would simply return nothing. An invite against a non-existent tenant would
   * otherwise create a Kratos identity attached to a row nobody can reach.
   */
  private async requireTenant(tenantIdParam: string): Promise<TenantId> {
    const tenantId = asTenantId(tenantIdParam);
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) throw new NotFoundException('No such site.');
    return tenantId;
  }
}

/** Same projection the site-admin controller uses; never exposes kratosIdentityId. */
function toDto(author: AuthorWithUsage): AuthorDto {
  return {
    id: author.id,
    username: author.username,
    name: author.name,
    email: author.email,
    role: author.role,
    status: author.status,
    lastSeenAt: author.lastSeenAt?.toISOString() ?? null,
    deactivatedAt: author.deactivatedAt?.toISOString() ?? null,
    contactPublic: author.contactPublic,
    publishedCount: author.publishedCount,
    draftCount: author.draftCount,
  };
}
