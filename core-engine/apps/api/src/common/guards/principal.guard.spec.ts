import { describe, it, expect, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { asTenantId, type TenantId } from '@core/shared';
import type { Author, AuthorRepository } from '@core/author';
import type {
  PlatformAdmin,
  PlatformAdminRepository,
} from '@core/platform-admin';
import { PrincipalGuard, type AuthenticatedRequest } from './principal.guard';

/**
 * Unit tests against in-memory port fakes — no database, per the testing
 * convention in core-engine/CLAUDE.md.
 *
 * This guard is the point where an edge-validated identity becomes a tenant
 * scope, so the cases that matter are the refusals, not the happy path.
 */

const TECH = '0198f000-0000-7000-8000-000000000001';

const anAuthor = (over: Partial<Author> = {}): Author => ({
  id: 'author-1',
  tenantId: asTenantId(TECH),
  kratosIdentityId: 'identity-1',
  username: 'mara-okonkwo',
  name: 'Mara Okonkwo',
  email: 'mara@example.test',
  quote: null,
  telegram: null,
  contactPublic: false,
  role: 'editor',
  avatarUrl: null,
  deactivatedAt: null,
  lastSeenAt: new Date('2026-09-01T00:00:00Z'),
  ...over,
});

const aPlatformAdmin = (over: Partial<PlatformAdmin> = {}): PlatformAdmin => ({
  id: 'pa-1',
  username: 'superadmin',
  name: 'Platform Owner',
  email: 'superadmin@example.test',
  isActive: true,
  ...over,
});

class FakeAuthors implements AuthorRepository {
  constructor(private readonly byIdentity: Record<string, Author> = {}) {}
  findByKratosIdentityId(id: string): Promise<Author | null> {
    return Promise.resolve(this.byIdentity[id] ?? null);
  }
  findByUsername(): Promise<Author | null> {
    return Promise.resolve(null);
  }
  findById(): Promise<Author | null> {
    return Promise.resolve(null);
  }

  // The management half of the port. This guard never calls it; the methods
  // exist so the fake satisfies the interface, and shout if that changes.
  listForAdmin(): never { throw new Error('not used by PrincipalGuard'); }
  create(): never { throw new Error('not used by PrincipalGuard'); }
  update(): never { throw new Error('not used by PrincipalGuard'); }
  setDeactivated(): never { throw new Error('not used by PrincipalGuard'); }
  countActiveAdmins(): never { throw new Error('not used by PrincipalGuard'); }
  existsWithUsername(): never { throw new Error('not used by PrincipalGuard'); }
  touchLastSeen(_tenantId: TenantId, _authorId: string, _staleBefore: Date): Promise<void> {
    return Promise.resolve();
  }
}

class FakePlatformAdmins implements PlatformAdminRepository {
  constructor(private readonly byIdentity: Record<string, PlatformAdmin> = {}) {}
  findByKratosIdentityId(id: string): Promise<PlatformAdmin | null> {
    return Promise.resolve(this.byIdentity[id] ?? null);
  }
}

function contextFor(headers: Record<string, string>): {
  ctx: ExecutionContext;
  req: AuthenticatedRequest;
} {
  const req = { headers, method: 'GET', url: '/admin/v1/me' } as unknown as
    AuthenticatedRequest;

  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;

  return { ctx, req };
}

let guard: PrincipalGuard;

describe('PrincipalGuard', () => {
  describe('when the identity header is absent', () => {
    beforeEach(() => {
      guard = new PrincipalGuard(new FakeAuthors(), new FakePlatformAdmins());
    });

    it('rejects with 401', async () => {
      const { ctx } = contextFor({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an empty header rather than treating it as an identity', async () => {
      // A blank header is not a subject. Falling through here would look up the
      // empty string and, on a table with a blank row, authenticate as it.
      const { ctx } = contextFor({ 'x-kratos-identity-id': '' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('when the identity resolves to an author', () => {
    beforeEach(() => {
      guard = new PrincipalGuard(
        new FakeAuthors({ 'identity-a': anAuthor() }),
        new FakePlatformAdmins(),
      );
    });

    it('attaches an author principal carrying the tenant', async () => {
      const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'identity-a' });

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.principal).toEqual({
        kind: 'author',
        authorId: 'author-1',
        tenantId: TECH,
        role: 'editor',
        username: 'mara-okonkwo',
        name: 'Mara Okonkwo',
      });
    });

    it('takes the tenant from the resolved row, not from client input', async () => {
      // The classic impersonation attempt: supply a tenant alongside the
      // identity. The header must be ignored entirely — docs/tenant-isolation.md.
      const { ctx, req } = contextFor({
        'x-kratos-identity-id': 'identity-a',
        'x-tenant-id': '0198f000-0000-7000-8000-000000000002',
      });

      await guard.canActivate(ctx);
      expect(req.principal).toMatchObject({ tenantId: TECH });
    });
  });

  describe('when the identity resolves to a platform admin', () => {
    it('attaches a principal with no tenant and no role', async () => {
      guard = new PrincipalGuard(
        new FakeAuthors(),
        new FakePlatformAdmins({ 'identity-p': aPlatformAdmin() }),
      );

      const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'identity-p' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      expect(req.principal).toEqual({
        kind: 'platform-admin',
        platformAdminId: 'pa-1',
        username: 'superadmin',
        name: 'Platform Owner',
      });
      // The absence is the point: nothing can read a tenant off this principal,
      // so no tenant-scoped repository can be called on their behalf.
      expect(req.principal).not.toHaveProperty('tenantId');
      expect(req.principal).not.toHaveProperty('role');
    });

    it('refuses a deactivated platform admin', async () => {
      guard = new PrincipalGuard(
        new FakeAuthors(),
        new FakePlatformAdmins({
          'identity-p': aPlatformAdmin({ isActive: false }),
        }),
      );

      const { ctx } = contextFor({ 'x-kratos-identity-id': 'identity-p' });
      // Immediately, on the next request — not at the next token expiry. This
      // is the whole reason the principal is resolved per request.
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('when the identity matches nothing', () => {
    it('refuses with 403 and does NOT auto-provision', async () => {
      const authors = new FakeAuthors();
      guard = new PrincipalGuard(authors, new FakePlatformAdmins());

      const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'stranger' });

      // A valid Kratos session proves an identity exists, not that anyone
      // assigned it to a tenant. Creating an Author here would silently grant
      // access to whichever tenant we guessed — docs/auth-request-flow.md.
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
      expect(req.principal).toBeUndefined();
    });
  });

  describe('resolution order', () => {
    it('prefers the author when an identity somehow matches both tables', async () => {
      // No database constraint can span two tables, so the order is fixed in
      // code rather than left to whichever query happens to return first.
      guard = new PrincipalGuard(
        new FakeAuthors({ both: anAuthor() }),
        new FakePlatformAdmins({ both: aPlatformAdmin() }),
      );

      const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'both' });
      await guard.canActivate(ctx);

      expect(req.principal?.kind).toBe('author');
    });
  });
});

describe('a deactivated author', () => {
  const deactivated = { 'identity-1': anAuthor({ deactivatedAt: new Date('2026-09-20T00:00:00Z') }) };

  it('is refused, with a code the backoffice can tell apart from "not provisioned"', async () => {
    const guard = new PrincipalGuard(new FakeAuthors(deactivated), new FakePlatformAdmins());
    const { ctx } = contextFor({ 'x-kratos-identity-id': 'identity-1' });

    const error = await guard.canActivate(ctx).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'ACCOUNT_DEACTIVATED' });
  });

  it('never gets a tenant scope attached to the request', async () => {
    const guard = new PrincipalGuard(new FakeAuthors(deactivated), new FakePlatformAdmins());
    const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'identity-1' });

    await guard.canActivate(ctx).catch(() => undefined);

    expect(req.principal).toBeUndefined();
  });
});

describe('recording last-seen', () => {
  it('is fire-and-forget, so a failure cannot refuse a valid request', async () => {
    const authors = new FakeAuthors({ 'identity-1': anAuthor() });
    authors.touchLastSeen = () => Promise.reject(new Error('database gone'));
    const guard = new PrincipalGuard(authors, new FakePlatformAdmins());
    const { ctx, req } = contextFor({ 'x-kratos-identity-id': 'identity-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.principal).toMatchObject({ kind: 'author' });
  });

  it('asks for a refresh only of values older than an hour', async () => {
    const authors = new FakeAuthors({ 'identity-1': anAuthor() });
    const calls: Date[] = [];
    authors.touchLastSeen = (_tenantId, _authorId, staleBefore: Date) => {
      calls.push(staleBefore);
      return Promise.resolve();
    };
    const guard = new PrincipalGuard(authors, new FakePlatformAdmins());

    await guard.canActivate(contextFor({ 'x-kratos-identity-id': 'identity-1' }).ctx);

    expect(calls).toHaveLength(1);
    const ageMs = Date.now() - calls[0]!.getTime();
    expect(ageMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(ageMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });
});
