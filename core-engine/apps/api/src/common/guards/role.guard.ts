import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthorRole } from '@core/author';
import { ROLES_KEY, PLATFORM_ONLY_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from './principal.guard';

/**
 * Answers "may they do this". Oathkeeper answered "who is this".
 *
 * Runs against the role on the live `authors` row, resolved moments earlier by
 * PrincipalGuard — never against a token or session claim. That is what makes a
 * demotion or a deactivation effective on the next request rather than at the
 * next token expiry. Root CLAUDE.md §5.
 *
 * Keto is deployed but is not consulted here: the model today is a tenant match
 * plus three ranked roles, which is a comparison, not a relation graph. See
 * infrastructure/ory/keto/README.md for the switch criteria.
 */
const RANK: Record<AuthorRole, number> = {
  contributor: 1,
  editor: 2,
  admin: 3,
};

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const platformOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      PLATFORM_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const minimum = this.reflector.getAllAndOverride<AuthorRole | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Neither decorator present: any provisioned principal may proceed. The
    // route is still behind PrincipalGuard, so this is not "public".
    if (!platformOnly && !minimum) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = req.principal;

    if (!principal) {
      // Guard ordering bug — RoleGuard registered without PrincipalGuard ahead
      // of it. Fail loudly rather than fall through to a permissive branch.
      throw new InternalServerErrorException(
        'RoleGuard ran before PrincipalGuard.',
      );
    }

    if (platformOnly) {
      if (principal.kind !== 'platform-admin') {
        throw new ForbiddenException('Platform administrator access required.');
      }
      return true;
    }

    // A tenant-role requirement. A platform admin fails it — not because they
    // rank lower, but because the requirement is meaningless for someone with no
    // tenant. Letting them through "because they're the super admin" is exactly
    // the cross-tenant access root CLAUDE.md §1 rules out.
    if (principal.kind !== 'author') {
      throw new ForbiddenException(
        'This endpoint operates on tenant data and requires a tenant author.',
      );
    }

    // `minimum` is non-null here: platformOnly is false and the early return
    // above covers both being absent.
    if (RANK[principal.role] < RANK[minimum as AuthorRole]) {
      throw new ForbiddenException(
        `This action requires the ${minimum} role or higher.`,
      );
    }

    return true;
  }
}
