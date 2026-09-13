import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import postgres from 'postgres';
import { asTenantId } from '@core/shared';
import { UmamiReadershipAnalytics } from '@core/article/infrastructure/umami-readership.analytics';
import { api, signIn, SEED } from './helpers/session';

/**
 * Dashboard analytics through the real gateway, plus a contract test of the
 * Umami adapter against the pinned Umami — docs/proposals/dashboard-analytics-umami.md
 * Slice 11.
 *
 * Meaningful with readership data present (`task db:seed:views`), but every
 * assertion here holds with none: isolation and scope are checked on whatever
 * the store returns.
 *
 * The Umami-outage test stops a container, so it runs only with
 * RUN_OUTAGE_TESTS=1 — reported as skipped otherwise, never silently passed.
 */

const RUN = Date.now().toString(36);
const UMAMI_URL = process.env.UMAMI_URL ?? 'http://localhost:3300';
const UMAMI_USER = process.env.UMAMI_ADMIN_USERNAME;
const UMAMI_PASSWORD = process.env.UMAMI_ADMIN_PASSWORD;

let editor: string;
let contributor: string;
let gaming: string;

interface Analytics {
  scope: 'site' | 'mine';
  timezone: string;
  editorial: {
    published: { current: number; previous: number };
    publishedByDay: { date: string; count: number }[];
    pipeline: { ready: number; needsExcerpt: number; needsCover: number };
  };
  authors: { authorId: string; name: string }[] | null;
  readership:
    | { status: 'not-connected' | 'unavailable' }
    | {
      status: 'ok';
      visitors: unknown;
      sources: unknown;
      daily: { date: string; views: number }[];
      topArticles: { articleId: string; authorName: string; daily: number[] }[];
      byCategory: { share: number }[];
    };
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
const analytics = (cookie: string, query = 'range=30d&tz=Asia/Phnom_Penh') =>
  api(`/admin/v1/dashboard/analytics?${query}`, { cookie });

async function articleIdsOf(cookie: string): Promise<Set<string>> {
  const res = await api('/admin/v1/articles?perPage=100', { cookie });
  const body = await json<{ data: { id: string }[] }>(res);
  return new Set(body.data.map(a => a.id));
}

beforeAll(async () => {
  [editor, contributor, gaming] = await Promise.all([
    signIn(SEED.techAuthor),
    signIn(SEED.techContributor),
    signIn(SEED.gamingAuthor),
  ]);
}, 45_000);

describe('shape and scope', () => {
  it('gives an editor the site, in the requested zone, with dense days', async () => {
    const res = await analytics(editor);
    expect(res.status).toBe(200);
    const a = await json<Analytics>(res);

    expect(a.scope).toBe('site');
    expect(a.timezone).toBe('Asia/Phnom_Penh');
    expect(a.editorial.publishedByDay).toHaveLength(30);
    expect(Array.isArray(a.authors)).toBe(true);
    expect(['ok', 'not-connected', 'unavailable']).toContain(a.readership.status);
    if (a.readership.status === 'ok') {
      expect(a.readership.daily).toHaveLength(30);
      for (const t of a.readership.topArticles) expect(t.daily).toHaveLength(30);
      const shares = a.readership.byCategory.reduce((s, c) => s + c.share, 0);
      if (a.readership.byCategory.length) expect(shares).toBeCloseTo(1, 6);
    }
  });

  it('gives a contributor only their own work — no authors, visitors or sources', async () => {
    const a = await json<Analytics>(await analytics(contributor));
    expect(a.scope).toBe('mine');
    expect(a.authors).toBeNull();
    if (a.readership.status === 'ok') {
      expect(a.readership.visitors).toBeNull();
      expect(a.readership.sources).toBeNull();
      // Every top article must be one the contributor authored. (`authorId` is
      // the API filter; `mine=1` is only the backoffice's URL for it.)
      const me = await json<{ id: string; name: string }>(await api('/admin/v1/me', { cookie: contributor }));
      const res = await api(`/admin/v1/articles?perPage=100&authorId=${me.id}`, { cookie: contributor });
      expect(res.status).toBe(200);
      const mine = new Set((await json<{ data: { id: string }[] }>(res)).data.map(x => x.id));
      for (const t of a.readership.topArticles) {
        expect(mine.has(t.articleId)).toBe(true);
        expect(t.authorName).toBe(me.name);
      }
    }
  });

  it('refuses an unknown time zone and an unknown range with 400', async () => {
    expect((await analytics(editor, 'tz=Mars/Olympus_Mons')).status).toBe(400);
    expect((await analytics(editor, 'range=1y')).status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('never shows one site\'s articles or authors on the other\'s dashboard', async () => {
    const [tech, gamingData, gamingArticles] = await Promise.all([
      analytics(editor).then(r => json<Analytics>(r)),
      analytics(gaming).then(r => json<Analytics>(r)),
      articleIdsOf(gaming),
    ]);

    if (tech.readership.status === 'ok') {
      for (const t of tech.readership.topArticles) expect(gamingArticles.has(t.articleId)).toBe(false);
    }
    const gamingAuthors = new Set((gamingData.authors ?? []).map(a => a.authorId));
    for (const a of tech.authors ?? []) expect(gamingAuthors.has(a.authorId)).toBe(false);
  });
});

describe('the pipeline and the readiness filter agree', () => {
  it('each pipeline count equals the matching filtered list total', async () => {
    const a = await json<Analytics>(await analytics(editor));
    const total = async (readiness: string) =>
      (await json<{ meta: { total: number } }>(
        await api(`/admin/v1/articles?readiness=${readiness}&perPage=1`, { cookie: editor }),
      )).meta.total;

    expect(await total('ready')).toBe(a.editorial.pipeline.ready);
    expect(await total('needs-excerpt')).toBe(a.editorial.pipeline.needsExcerpt);
    expect(await total('needs-cover')).toBe(a.editorial.pipeline.needsCover);
  });
});

describe('the platform dashboard', () => {
  it('carries views30d as a number or null for every site', async () => {
    const username = process.env.SUPER_ADMIN_USERNAME;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!username || !password) throw new Error('SUPER_ADMIN_* not set — run through `task test:integration`.');
    const platform = await signIn(username, password);

    const res = await api('/admin/v1/dashboard', { cookie: platform });
    const body = await json<{ tenants: { views30d: number | null }[] }>(res);
    for (const t of body.tenants) expect(t.views30d === null || typeof t.views30d === 'number').toBe(true);

    // Analytics is tenant data: a platform admin has no tenant.
    expect((await analytics(platform)).status).toBe(403);
  });
});

describe('Umami adapter contract (pinned image)', () => {
  const path = `/article/int-contract-${RUN}`;
  let websiteId: string;

  beforeAll(async () => {
    if (!UMAMI_USER || !UMAMI_PASSWORD) throw new Error('UMAMI_ADMIN_* not set — run through `task test:integration`.');
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const [row] = await sql<{ id: string }[]>`select umami_website_id as id from tenants where id = ${SEED.techTenantId}`;
      if (!row?.id) throw new Error('technology tenant is not provisioned — run `task analytics:provision`.');
      websiteId = row.id;
    }
    finally {
      await sql.end();
    }
  });

  afterAll(async () => {
    const sql = postgres(process.env.DATABASE_URL!.replace(/\/[^/]+$/, '/umami'), { max: 1, onnotice: () => {} });
    try {
      await sql`delete from website_event where url_path = ${path}`;
      await sql`delete from session where session_id not in (select session_id from website_event)`;
    }
    finally {
      await sql.end();
    }
  });

  it('what track() writes, summary(), daily() and byPath() read back', async () => {
    const umami = new UmamiReadershipAnalytics({ url: UMAMI_URL, username: UMAMI_USER!, password: UMAMI_PASSWORD! });
    const site = { tenantId: asTenantId(SEED.techTenantId), websiteId, hostname: 'contract.test' };
    const at = new Date(Date.now() - 60 * 60 * 1000);

    await umami.track(site, {
      path,
      title: 'Contract probe',
      referrer: 'https://l.facebook.com/',
      ip: '203.0.113.250',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      at,
    });

    const window = { from: new Date(at.getTime() - 60_000), to: new Date(Date.now() + 60_000), timezone: 'UTC' };
    expect(await umami.summary(site, window, { path })).toEqual({ views: 1, visitors: 1 });
    expect((await umami.daily(site, window, { path })).reduce((t, d) => t + d.views, 0)).toBe(1);
    expect((await umami.byPath(site, window, 500)).find(p => p.path === path)?.views).toBe(1);
  });
});

describe('recording survives an analytics outage', () => {
  it.skipIf(!process.env.RUN_OUTAGE_TESTS)('POST /public/v1/views is still 200, and fast, with Umami stopped', async () => {
    const key = process.env.TECH_TENANT_KEY!;
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    const [article] = await sql<{ id: string }[]>`
      select id from articles where tenant_id = ${SEED.techTenantId} and status = 'published' limit 1`;
    const startedAt = new Date();

    execSync('docker stop artical-umami-1', { stdio: 'ignore' });
    try {
      const t0 = Date.now();
      const res = await api('/public/v1/views', {
        method: 'POST',
        headers: { 'X-Tenant-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article!.id }),
      });
      expect(res.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(1_000);
    }
    finally {
      execSync('docker start artical-umami-1', { stdio: 'ignore' });
      await sql`delete from article_views where article_id = ${article!.id} and occurred_at >= ${startedAt}`;
      await sql`update article_view_counts set total = total - 1 where article_id = ${article!.id}`;
      await sql.end();
    }
  });
});
