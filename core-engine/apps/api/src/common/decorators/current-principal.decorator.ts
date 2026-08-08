import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  createParamDecorator,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../guards/principal.guard';
import type { AuthorPrincipal, Principal } from '../principal';

/**
 * The principal resolved by PrincipalGuard.
 *
 * Throws rather than returning undefined when the guard has not run: a
 * controller reading a principal that was never resolved is a wiring bug, and
 * silently handing it `undefined` turns that into a null-check somewhere further
 * downstream where the cause is no longer visible.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.principal) {
      throw new InternalServerErrorException(
        'Principal not resolved — PrincipalGuard is missing on this route.',
      );
    }

    return req.principal;
  },
);

/**
 * The principal, narrowed to an author.
 *
 * For the common case: almost every admin endpoint operates on tenant-owned data
 * and needs a `tenantId`. Using this instead of `@CurrentPrincipal()` means the
 * handler receives a type that HAS a tenantId, with no narrowing boilerplate and
 * no opportunity to forget it.
 *
 * A platform admin hitting such a route gets a 403 rather than a crash — they
 * genuinely cannot perform a tenant-scoped operation, because they have no
 * tenant to perform it in.
 */
export const CurrentAuthor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthorPrincipal => {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.principal) {
      throw new InternalServerErrorException(
        'Principal not resolved — PrincipalGuard is missing on this route.',
      );
    }

    if (req.principal.kind !== 'author') {
      throw new ForbiddenException(
        'This endpoint operates on tenant data and requires a tenant author.',
      );
    }

    return req.principal;
  },
);
