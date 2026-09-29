import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { asTenantId } from '@core/shared';
import { RolePermissionChecker, type Permission } from '@core/author';
import { PermissionGuard } from './permission.guard';
import { PERMISSION_KEY, PLATFORM_ONLY_KEY } from '../decorators/permissions.decorator';
import type { AuthenticatedRequest } from './principal.guard';
import type { Principal } from '../principal';

/**
 * Replaces role.guard.spec.ts, which tested the ranked-role guard this supersedes.
 * The cases are the same ones, expressed as permissions — that equivalence is the
 * point: the migration from `@Roles` must not have changed who may do what.
 */

const TECH = asTenantId('0198f000-0000-7000-8000-000000000001');

const author = (role: 'admin' | 'editor' | 'contributor'): Principal => ({
  kind: 'author',
  authorId: 'author-1',
  tenantId: TECH,
  role,
  username: 'mara-okonkwo',
  name: 'Mara Okonkwo',
});

const platformAdmin: Principal = {
  kind: 'platform-admin',
  platformAdminId: 'pa-1',
  username: 'superadmin',
  name: 'Platform Owner',
};

/** A context carrying metadata the way @RequirePermission / @PlatformAdminOnly do. */
function contextFor(
  principal: Principal | undefined,
  metadata: { permission?: Permission; platformOnly?: boolean } = {},
): ExecutionContext {
  const handler = () => undefined;
  if (metadata.permission) Reflect.defineMetadata(PERMISSION_KEY, metadata.permission, handler);
  if (metadata.platformOnly) Reflect.defineMetadata(PLATFORM_ONLY_KEY, true, handler);

  const req = { principal } as AuthenticatedRequest;
  return {
    getHandler: () => handler,
    getClass: () => class Anonymous {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

let guard: PermissionGuard;

beforeEach(() => {
  guard = new PermissionGuard(new Reflector(), new RolePermissionChecker());
});

describe('PermissionGuard', () => {
  it('lets an unannotated route through — PrincipalGuard already did the work', async () => {
    await expect(guard.canActivate(contextFor(author('contributor')))).resolves.toBe(true);
  });

  it('refuses a permission the role does not hold, naming the permission', async () => {
    const error = await guard
      .canActivate(contextFor(author('contributor'), { permission: 'articles.publish' }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'articles.publish' },
    });
  });

  it('allows a permission the role holds', async () => {
    await expect(guard.canActivate(contextFor(author('editor'), { permission: 'articles.publish' })))
      .resolves.toBe(true);
    await expect(guard.canActivate(contextFor(author('contributor'), { permission: 'articles.write' })))
      .resolves.toBe(true);
  });

  it('keeps author management to admins', async () => {
    await expect(guard.canActivate(contextFor(author('admin'), { permission: 'authors.invite' })))
      .resolves.toBe(true);
    await expect(guard.canActivate(contextFor(author('editor'), { permission: 'authors.invite' })))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a platform admin on a tenant route — they have no tenant', async () => {
    await expect(guard.canActivate(contextFor(platformAdmin, { permission: 'articles.read' })))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces platform-only routes in the other direction', async () => {
    await expect(guard.canActivate(contextFor(platformAdmin, { platformOnly: true })))
      .resolves.toBe(true);
    await expect(guard.canActivate(contextFor(author('admin'), { platformOnly: true })))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails loudly when it runs without PrincipalGuard', async () => {
    // A wiring mistake, not a permission decision: refusing with a 403 here
    // would look like a permissions bug and be debugged in the wrong place.
    await expect(guard.canActivate(contextFor(undefined, { permission: 'articles.read' })))
      .rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
