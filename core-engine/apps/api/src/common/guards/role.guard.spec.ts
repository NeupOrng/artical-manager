import { describe, it, expect } from 'vitest';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { asTenantId } from '@core/shared';
import type { AuthorRole } from '@core/author';
import { RoleGuard } from './role.guard';
import type { AuthenticatedRequest } from './principal.guard';
import type { Principal } from '../principal';
import { ROLES_KEY, PLATFORM_ONLY_KEY } from '../decorators/roles.decorator';

const authorPrincipal = (role: AuthorRole): Principal => ({
  kind: 'author',
  authorId: 'author-1',
  tenantId: asTenantId('0198f000-0000-7000-8000-000000000001'),
  role,
  username: 'mara-okonkwo',
  name: 'Mara Okonkwo',
});

const platformPrincipal: Principal = {
  kind: 'platform-admin',
  platformAdminId: 'pa-1',
  username: 'superadmin',
  name: 'Platform Owner',
};

/**
 * Stands in for route metadata. `getAllAndOverride` is what the guard calls, so
 * that is what the fake implements — a Reflector whose behaviour is faked at a
 * different method would pass while the real one returns undefined.
 */
function reflectorWith(meta: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
}

function contextFor(principal?: Principal): ExecutionContext {
  const req = { principal } as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  describe('with no role metadata', () => {
    it('admits any provisioned principal', () => {
      // Still behind PrincipalGuard — "no role requirement" is not "public".
      const guard = new RoleGuard(reflectorWith({}));
      expect(guard.canActivate(contextFor(authorPrincipal('contributor')))).toBe(true);
    });
  });

  describe('ranked roles', () => {
    const guard = (min: AuthorRole) => new RoleGuard(reflectorWith({ [ROLES_KEY]: min }));

    it('admits the exact role', () => {
      expect(guard('editor').canActivate(contextFor(authorPrincipal('editor')))).toBe(true);
    });

    it('admits a higher role', () => {
      // The point of ranking: an admin passes an editor requirement without the
      // endpoint having to list both.
      expect(guard('editor').canActivate(contextFor(authorPrincipal('admin')))).toBe(true);
    });

    it('refuses a lower role', () => {
      expect(() =>
        guard('editor').canActivate(contextFor(authorPrincipal('contributor'))),
      ).toThrow(ForbiddenException);
    });
  });

  describe('platform admins against tenant routes', () => {
    it('refuses, rather than treating them as outranking every author', () => {
      // A platform admin is not a fourth rung on the ladder. They have no
      // tenant, so "is an admin of this tenant's content" is not a question that
      // has a yes for them — root CLAUDE.md §1, strict tenant isolation.
      const guard = new RoleGuard(reflectorWith({ [ROLES_KEY]: 'contributor' }));
      expect(() => guard.canActivate(contextFor(platformPrincipal))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('platform-only routes', () => {
    const guard = new RoleGuard(reflectorWith({ [PLATFORM_ONLY_KEY]: true }));

    it('admits a platform admin', () => {
      expect(guard.canActivate(contextFor(platformPrincipal))).toBe(true);
    });

    it('refuses a tenant author, including one with the admin role', () => {
      expect(() => guard.canActivate(contextFor(authorPrincipal('admin')))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('guard ordering', () => {
    it('fails loudly when PrincipalGuard did not run first', () => {
      // Never fall through to a permissive branch on a wiring bug.
      const guard = new RoleGuard(reflectorWith({ [ROLES_KEY]: 'admin' }));
      expect(() => guard.canActivate(contextFor(undefined))).toThrow(
        InternalServerErrorException,
      );
    });
  });
});
