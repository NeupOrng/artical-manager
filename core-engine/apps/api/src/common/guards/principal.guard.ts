import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { asTenantId } from '@core/shared';
import { AUTHOR_REPOSITORY, type AuthorRepository } from '@core/author';
import {
  PLATFORM_ADMIN_REPOSITORY,
  type PlatformAdminRepository,
} from '@core/platform-admin';
import type { Principal } from '../principal';

/**
 * The single header this API trusts. Oathkeeper sets it after validating the
 * Kratos session; Kong strips any client-supplied copy before Oathkeeper runs.
 *
 * That stripping is what makes this trustworthy — NOT the fact that the request
 * arrived on an internal network, because there isn't one. The frontends are on
 * a managed host and reach this API over the public internet.
 * See docs/auth-request-flow.md.
 */
const IDENTITY_HEADER = 'x-kratos-identity-id';

@Injectable()
export class PrincipalGuard implements CanActivate {
  private readonly logger = new Logger(PrincipalGuard.name);

  constructor(
    @Inject(AUTHOR_REPOSITORY)
    private readonly authors: AuthorRepository,
    @Inject(PLATFORM_ADMIN_REPOSITORY)
    private readonly platformAdmins: PlatformAdminRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const identityId = req.headers[IDENTITY_HEADER];

    if (typeof identityId !== 'string' || identityId.length === 0) {
      // Unreachable in a correctly configured deployment: Oathkeeper rejects an
      // invalid session before this, and always sets the header on a valid one.
      //
      // Reaching here means the edge is misconfigured or something is talking to
      // the API directly, so it is logged at `error` — infrastructure/CLAUDE.md
      // lists this as an alarm that must page a human. Do not downgrade it to a
      // routine 401 just because the response code looks ordinary.
      this.logger.error(
        `Request to ${req.method} ${req.url} carried no identity header. `
        + 'The edge is misconfigured or is being bypassed.',
      );
      throw new UnauthorizedException('Missing identity.');
    }

    // Authors are resolved FIRST and platform admins only as a fallback. The two
    // tables cannot share an identity by construction (one person is either a
    // tenant author or a platform operator), but the database cannot express a
    // uniqueness constraint spanning two tables — so the order is what decides,
    // and it is fixed here rather than left to whichever query returns first.
    const author = await this.authors.findByKratosIdentityId(identityId);

    if (author) {
      (req as AuthenticatedRequest).principal = {
        kind: 'author',
        authorId: author.id,
        // The ONLY legitimate source of tenant scope for this request.
        tenantId: asTenantId(author.tenantId),
        role: author.role,
        username: author.username,
        name: author.name,
      };
      return true;
    }

    const platformAdmin
      = await this.platformAdmins.findByKratosIdentityId(identityId);

    if (platformAdmin) {
      // Deactivation takes effect on the very next request precisely because
      // this is resolved per request rather than read off a token claim.
      if (!platformAdmin.isActive) {
        throw new ForbiddenException('This account has been deactivated.');
      }

      (req as AuthenticatedRequest).principal = {
        kind: 'platform-admin',
        platformAdminId: platformAdmin.id,
        username: platformAdmin.username,
        name: platformAdmin.name,
      };
      return true;
    }

    // A valid session with no matching row. 403, never auto-provisioned: the
    // identity exists but nobody assigned it to a tenant, and creating an Author
    // here would silently grant access to whichever tenant we guessed.
    // docs/auth-request-flow.md.
    this.logger.warn(
      `Identity ${identityId} authenticated but matches no author or platform admin.`,
    );
    throw new ForbiddenException('This identity is not provisioned.');
  }
}

/** Express request after the guard has run. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
