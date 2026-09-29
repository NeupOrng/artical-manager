import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
  AuthorNotFoundError,
  IDENTITY_PROVIDER,
  deactivateAuthor,
  inviteAuthor,
  reactivateAuthor,
  reissueInvite,
  updateAuthor,
  type AuthorRepository,
  type AuthorWithUsage,
  type IdentityProvider,
  type IssuedRecoveryLink,
} from '@core/author';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentAuthor } from '../../common/decorators/current-principal.decorator';
import type { AuthorPrincipal } from '../../common/principal';
import {
  AuthorDto,
  AuthorListDto,
  InviteAuthorDto,
  InviteLinkDto,
  InvitedAuthorDto,
  ListAuthorsQuery,
  UpdateAuthorDto,
} from './dto/author.dto';

/**
 * Who has access to this site: invite, edit, deactivate, reactivate.
 *
 * `authors.*` is an ADMIN permission, so editors and contributors get a 403.
 * `@CurrentAuthor()` throughout: this is tenant data, and a platform admin has
 * no tenant — they are refused rather than seeing nothing (root CLAUDE.md §5).
 *
 * Every lookup is tenant-scoped, and a miss is **404, never 403** — a 403 would
 * confirm the author exists on another site. docs/tenant-isolation.md.
 *
 * No business logic here: the rules that hold whoever is asking (last admin,
 * not yourself, what an invite may do) live in `libs/author`.
 */
@ApiTags('admin/authors')
@Controller('admin/v1/authors')
@UseGuards(PrincipalGuard, PermissionGuard)
export class AuthorsController {
  constructor(
    @Inject(AUTHOR_REPOSITORY) private readonly authors: AuthorRepository,
    @Inject(IDENTITY_PROVIDER) private readonly identities: IdentityProvider,
  ) {}

  private get deps() {
    return { authors: this.authors, identities: this.identities };
  }

  @Get()
  @RequirePermission('authors.read')
  @ApiOperation({ summary: 'Everyone with access to this site, including deactivated' })
  @ApiOkResponse({ type: AuthorListDto })
  async list(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Query() query: ListAuthorsQuery,
  ): Promise<AuthorListDto> {
    const rows = await this.authors.listForAdmin(actor.tenantId);
    const term = query.search?.trim().toLowerCase();

    // Filtered here rather than in SQL on purpose: a site has a handful of
    // authors, and `status` is DERIVED (domain/access.ts). Recomputing that
    // derivation as a SQL predicate would be a second definition of it.
    const matches = rows.filter(a =>
      (!query.status || a.status === query.status)
      && (!query.role || a.role === query.role)
      && (!term
        || a.name.toLowerCase().includes(term)
        || (a.username ?? '').toLowerCase().includes(term)));

    return { data: matches.map(toDto) };
  }

  @Get(':authorId')
  @RequirePermission('authors.read')
  @ApiOperation({ summary: 'One author' })
  @ApiOkResponse({ type: AuthorDto })
  @ApiNotFoundResponse({ description: 'Missing, or belongs to another site.' })
  findOne(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Param('authorId', ParseUUIDPipe) authorId: string,
  ): Promise<AuthorDto> {
    return this.detail(actor, authorId);
  }

  @Post()
  @RequirePermission('authors.invite')
  @ApiOperation({
    summary: 'Invite an author',
    description:
      'Creates a login with NO password and returns a single-use link for setting '
      + 'one. Show the link once and send it to them; nobody ever handles another '
      + "person's password.",
  })
  @ApiCreatedResponse({ type: InvitedAuthorDto })
  @ApiConflictResponse({ description: 'Username taken, or that email already has an account.' })
  @ApiServiceUnavailableResponse({ description: 'The identity service did not respond. Retry.' })
  async invite(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Body() dto: InviteAuthorDto,
  ): Promise<InvitedAuthorDto> {
    const { authorId, invite } = await inviteAuthor(this.deps, {
      // The site comes from the SESSION, never the body — an admin can only
      // invite into their own site.
      tenantId: actor.tenantId,
      username: dto.username,
      name: dto.name,
      email: dto.email,
      role: dto.role,
    });

    return { author: await this.detail(actor, authorId), invite: toInviteDto(invite) };
  }

  @Post(':authorId/invite-link')
  @RequirePermission('authors.invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'A fresh invite link, while the first is unaccepted' })
  @ApiOkResponse({ type: InviteLinkDto })
  @ApiConflictResponse({
    description: 'They have already signed in, or are deactivated.',
  })
  async reissue(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Param('authorId', ParseUUIDPipe) authorId: string,
  ): Promise<InviteLinkDto> {
    return toInviteDto(await reissueInvite(this.deps, { tenantId: actor.tenantId, authorId }));
  }

  @Patch(':authorId')
  @RequirePermission('authors.update')
  @ApiOperation({
    summary: 'Change name, contact email or role',
    description:
      'The username is fixed at creation — it is the login identifier and a '
      + 'public URL. Sending it is a 400.',
  })
  @ApiOkResponse({ type: AuthorDto })
  @ApiConflictResponse({
    description:
      'That email already has an account, the author is deactivated, or the '
      + 'change would leave the site with no admin.',
  })
  async update(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Param('authorId', ParseUUIDPipe) authorId: string,
    @Body() dto: UpdateAuthorDto,
  ): Promise<AuthorDto> {
    await updateAuthor(this.deps, {
      tenantId: actor.tenantId,
      actorId: actor.authorId,
      authorId,
      changes: { name: dto.name, email: dto.email, role: dto.role },
    });
    return this.detail(actor, authorId);
  }

  /**
   * A verb on a sub-resource, like publish/unpublish: the guards are explicit
   * and a generic PATCH cannot become a way around them.
   */
  @Post(':authorId/deactivate')
  @RequirePermission('authors.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw access',
    description:
      'Refuses them on their next request, disables the login, and ends their '
      + 'sessions. Their articles stay published; their public profile is hidden.',
  })
  @ApiOkResponse({ type: AuthorDto })
  @ApiConflictResponse({ description: 'Your own account, or the last admin of the site.' })
  @ApiForbiddenResponse({ description: 'Requires the admin role.' })
  async deactivate(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Param('authorId', ParseUUIDPipe) authorId: string,
  ): Promise<AuthorDto> {
    await deactivateAuthor(this.deps, {
      tenantId: actor.tenantId,
      actorId: actor.authorId,
      authorId,
      now: new Date(),
    });
    return this.detail(actor, authorId);
  }

  @Post(':authorId/reactivate')
  @RequirePermission('authors.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore access. They sign in again; sessions are not restored.' })
  @ApiOkResponse({ type: AuthorDto })
  async reactivate(
    @CurrentAuthor() actor: AuthorPrincipal,
    @Param('authorId', ParseUUIDPipe) authorId: string,
  ): Promise<AuthorDto> {
    await reactivateAuthor(this.deps, { tenantId: actor.tenantId, authorId });
    return this.detail(actor, authorId);
  }

  /**
   * Re-reads the row so a response always carries the derived status and the
   * article counts. A site has a handful of authors, so the list read is cheap
   * and there is one mapping rather than two.
   */
  private async detail(actor: AuthorPrincipal, authorId: string): Promise<AuthorDto> {
    const rows = await this.authors.listForAdmin(actor.tenantId);
    const row = rows.find(a => a.id === authorId);
    if (!row) throw new AuthorNotFoundError(authorId);
    return toDto(row);
  }
}

/** Never exposes `kratosIdentityId`: it identifies the account to the identity service. */
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

function toInviteDto(invite: IssuedRecoveryLink): InviteLinkDto {
  return { link: invite.link, expiresAt: invite.expiresAt.toISOString() };
}
