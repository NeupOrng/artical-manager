import { describe, it, expect, beforeAll } from 'vitest';
import { api, signIn, SEED } from './helpers/session';

/**
 * The admin surface, through the real gateway.
 *
 * WHY THIS FILE EXISTS: every unit test in this repo passed while every media
 * endpoint returned 401. Moving /admin/v1 behind Oathkeeper removed Kong's
 * key-auth plugin, which was the only thing setting X-Consumer-Custom-ID, and
 * MediaController still read that header. Typecheck, lint, and 46 unit tests
 * were green, and no file in the media module had changed.
 *
 * A unit test cannot catch that, because the bug lives between three systems.
 * These do.
 */

let authorCookie: string;

beforeAll(async () => {
  authorCookie = await signIn(SEED.techAuthor);
}, 30_000);

describe('the gateway rejects what it should', () => {
  it('401s a request with no session', async () => {
    const res = await api('/admin/v1/me');
    expect(res.status).toBe(401);
  });

  it('401s a FORGED identity header — the impersonation case', async () => {
    // NestJS trusts X-Kratos-Identity-Id absolutely; it is the entire
    // authentication result. Kong must strip any client-supplied copy before
    // Oathkeeper sets the real one. A 200 here is full impersonation of any
    // author in any tenant.
    //
    // Sending this same header straight to the API on :3000 returns 200 with
    // that identity's principal, which is exactly why this must be tested
    // through the gateway and not around it.
    const res = await api('/admin/v1/me', {
      headers: { 'X-Kratos-Identity-Id': '2dae1995-6157-4e70-9497-fd472219aa59' },
    });
    expect(res.status).toBe(401);
  });

  it('401s an admin route with only a tenant API key', async () => {
    // The interim auth that used to guard /admin/v1. A site's public read key
    // must never also be an admin credential.
    const res = await api('/admin/v1/media', {
      headers: { 'X-Tenant-Key': process.env.TECH_TENANT_KEY ?? 'whatever' },
    });
    expect(res.status).toBe(401);
  });
});

describe('a signed-in author', () => {
  it('resolves to a principal carrying their tenant', async () => {
    const res = await api('/admin/v1/me', { cookie: authorCookie });
    expect(res.status).toBe(200);

    const me = await res.json();
    expect(me.kind).toBe('author');
    expect(me.username).toBe(SEED.techAuthor);
    // A real value, not just a shape: asserting `toBeDefined()` would pass
    // against a principal resolved to the wrong tenant.
    expect(me.tenantId).toBe(SEED.techTenantId);
    expect(me.tenantName).toBe('Technology Site');
    expect(me.role).toBeTruthy();
  });

  it('can reach the media library', async () => {
    // The regression this suite was written for.
    const res = await api('/admin/v1/media', { cookie: authorCookie });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('gets a dashboard with real, non-zero counts', async () => {
    const res = await api('/admin/v1/dashboard', { cookie: authorCookie });
    expect(res.status).toBe(200);

    const dash = await res.json();
    expect(dash.kind).toBe('author');
    // Non-zero on purpose. "Returns an object" passes against an aggregation
    // that counts nothing — which is how the platform dashboard shipped broken.
    expect(dash.articles.published).toBeGreaterThan(0);
    expect(dash.recent.length).toBeGreaterThan(0);
  });
});

describe('a platform admin', () => {
  let platformCookie: string;

  beforeAll(async () => {
    const username = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!password) return;
    platformCookie = await signIn(username, password);
  }, 30_000);

  it.runIf(process.env.SUPER_ADMIN_PASSWORD)(
    'is refused from tenant-owned data rather than treated as a super-user',
    async () => {
      // Not a fourth rung on the role ladder. They have no tenant, so "may they
      // read this tenant's media" has no yes — root CLAUDE.md §1.
      const res = await api('/admin/v1/media', { cookie: platformCookie });
      expect(res.status).toBe(403);
    },
  );

  it.runIf(process.env.SUPER_ADMIN_PASSWORD)(
    'sees aggregate counts and no article content',
    async () => {
      const res = await api('/admin/v1/dashboard', { cookie: platformCookie });
      expect(res.status).toBe(200);

      const dash = await res.json();
      expect(dash.kind).toBe('platform-admin');
      expect(dash.tenants.length).toBeGreaterThan(0);
      expect(dash.tenants[0].publishedCount).toBeGreaterThan(0);
      // The isolation boundary, asserted on the shape so a field added later
      // fails here rather than passing review.
      expect(Object.keys(dash.tenants[0]).sort()).toEqual([
        'authorCount',
        'domain',
        'draftCount',
        'id',
        'name',
        'nicheLabel',
        'publishedCount',
        // Added 2026-09-12, deliberately: readership over 30 days — an
        // aggregate like the counts above, never titles or content.
        'views30d',
      ]);
      // Null when the site has no analytics website or Umami is down — both
      // must leave the rest of this screen working.
      for (const t of dash.tenants) {
        expect(t.views30d === null || typeof t.views30d === 'number').toBe(true);
      }
    },
  );
});
