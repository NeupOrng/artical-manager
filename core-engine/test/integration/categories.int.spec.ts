import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { api, signIn, SEED } from './helpers/session';

/**
 * Categories through the real gateway: the admin surface, the public
 * resolution the sites 301/404 from, and the two bugs this feature fixed.
 *
 * Every name and slug carries a per-run suffix. Kong caches public reads for
 * 60s keyed on the URL, so a slug reused across runs could be answered from a
 * previous run's cache and pass or fail for reasons unrelated to the code.
 *
 * Categories cannot be hard-deleted through the API (retire is a soft delete),
 * so afterAll removes this run's rows directly when DATABASE_URL is available —
 * `task test:integration` provides it. Without it they are left retired.
 */

const RUN = Date.now().toString(36);
const TECH_KEY = process.env.TECH_TENANT_KEY;

let editor: string;
let gaming: string;
let contributor: string;

const categoryIds: string[] = [];
const articleIds: string[] = [];

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  articleCount: number;
  retiredAt: string | null;
}
interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
interface Resolution {
  kind: 'category' | 'redirect';
  slug: string;
  name?: string;
  description?: string | null;
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function createCategory(
  body: { name: string; slug?: string; description?: string },
  as = editor,
): Promise<CategoryBody> {
  const res = await api('/admin/v1/categories', {
    method: 'POST', cookie: as, headers: JSON_HEADERS, body: JSON.stringify(body),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const c = await json<CategoryBody>(res);
  categoryIds.push(c.id);
  return c;
}

const retire = (id: string, as = editor) =>
  api(`/admin/v1/categories/${id}`, { method: 'DELETE', cookie: as });

const restore = (id: string, as = editor) =>
  api(`/admin/v1/categories/${id}/restore`, { method: 'POST', cookie: as });

const patchCategory = (id: string, body: Record<string, unknown>, as = editor) =>
  api(`/admin/v1/categories/${id}`, {
    method: 'PATCH', cookie: as, headers: JSON_HEADERS, body: JSON.stringify(body),
  });

async function listAll(as = editor): Promise<CategoryBody[]> {
  const res = await api('/admin/v1/categories?include=retired', { cookie: as });
  return (await json<{ data: CategoryBody[] }>(res)).data;
}

async function publishedArticle(title: string, categoryId: string): Promise<string> {
  const res = await api('/admin/v1/articles', {
    method: 'POST',
    cookie: editor,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      title,
      categoryId,
      excerpt: 'A real excerpt for the share preview.',
      coverImage: 'http://localhost:9000/media/seed/probe.jpg',
    }),
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const { id } = await json<{ id: string }>(res);
  articleIds.push(id);

  const pub = await api(`/admin/v1/articles/${id}/publish`, { method: 'POST', cookie: editor });
  expect(pub.ok, await pub.clone().text()).toBe(true);
  return id;
}

const publicGet = (path: string) =>
  api(`/public/v1${path}`, { headers: { 'X-Tenant-Key': TECH_KEY ?? '' } });

beforeAll(async () => {
  [editor, gaming, contributor] = await Promise.all([
    signIn(SEED.techAuthor),
    signIn(SEED.gamingAuthor),
    signIn(SEED.techContributor),
  ]);
}, 45_000);

afterAll(async () => {
  for (const id of articleIds) {
    await api(`/admin/v1/articles/${id}`, { method: 'DELETE', cookie: editor });
  }
  for (const id of categoryIds) await retire(id);

  const url = process.env.DATABASE_URL;
  if (!url || !categoryIds.length) return;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Redirect rows cascade with their category.
    await sql`delete from categories where id in ${sql(categoryIds)}`;
  }
  finally {
    await sql.end();
  }
});

describe('the admin shape', () => {
  it('carries description, position and retiredAt, and lands new categories last', async () => {
    const before = (await listAll()).filter(c => !c.retiredAt);
    const c = await createCategory({ name: `Int Shape ${RUN}`, description: '  A summary.  ' });

    expect(c.description).toBe('A summary.');
    expect(c.retiredAt).toBeNull();
    expect(c.articleCount).toBe(0);
    expect(c.position).toBe(Math.max(-1, ...before.map(x => x.position)) + 1);
  });

  it('clears a description with null', async () => {
    const c = await createCategory({ name: `Int Clear ${RUN}`, description: 'Temporary.' });
    const res = await patchCategory(c.id, { description: null });
    expect(res.status).toBe(200);
    expect((await json<CategoryBody>(res)).description).toBeNull();
  });

  it('lists retired categories only when asked', async () => {
    const c = await createCategory({ name: `Int Hidden ${RUN}` });
    expect((await retire(c.id)).status).toBe(200);

    const plain = await json<{ data: CategoryBody[] }>(await api('/admin/v1/categories', { cookie: editor }));
    expect(plain.data.some(x => x.id === c.id)).toBe(false);

    const all = await listAll();
    const row = all.find(x => x.id === c.id);
    expect(row?.retiredAt).not.toBeNull();
    // Live first, retired after.
    const firstRetired = all.findIndex(x => x.retiredAt);
    expect(all.slice(firstRetired).every(x => x.retiredAt)).toBe(true);
  });
});

describe('roles', () => {
  it('lets a contributor read but not write', async () => {
    expect((await api('/admin/v1/categories', { cookie: contributor })).status).toBe(200);

    const res = await api('/admin/v1/categories', {
      method: 'POST', cookie: contributor, headers: JSON_HEADERS,
      body: JSON.stringify({ name: `Int Contributor ${RUN}` }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses a contributor reorder and restore', async () => {
    const c = await createCategory({ name: `Int Role ${RUN}` });
    await retire(c.id);
    expect((await restore(c.id, contributor)).status).toBe(403);

    const res = await api('/admin/v1/categories/reorder', {
      method: 'POST', cookie: contributor, headers: JSON_HEADERS,
      body: JSON.stringify({ ids: [c.id] }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses a contributor publish — the seeded contributor exists to prove this', async () => {
    const res = await api('/admin/v1/articles', {
      method: 'POST', cookie: contributor, headers: JSON_HEADERS,
      body: JSON.stringify({ title: `Int Contributor Draft ${RUN}` }),
    });
    expect(res.status).toBe(201);
    const { id } = await json<{ id: string }>(res);
    articleIds.push(id);

    const pub = await api(`/admin/v1/articles/${id}/publish`, { method: 'POST', cookie: contributor });
    expect(pub.status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('404s another tenant editing, retiring or restoring a category', async () => {
    const c = await createCategory({ name: `Int Foreign ${RUN}` });

    expect((await patchCategory(c.id, { name: 'Hijacked' }, gaming)).status).toBe(404);
    expect((await retire(c.id, gaming)).status).toBe(404);
    await retire(c.id);
    expect((await restore(c.id, gaming)).status).toBe(404);
  });

  it('matches nothing when filtering articles by another tenant\'s category', async () => {
    const c = await createCategory({ name: `Int Filter Foreign ${RUN}` });
    await publishedArticle(`Int Filter Foreign Article ${RUN}`, c.id);

    const res = await api(`/admin/v1/articles?categoryId=${c.id}`, { cookie: gaming });
    expect(res.status).toBe(200);
    expect((await json<{ data: unknown[] }>(res)).data).toHaveLength(0);
  });
});

describe('filtering articles by category', () => {
  it('returns only that category\'s articles', async () => {
    const c = await createCategory({ name: `Int Filter ${RUN}` });
    const id = await publishedArticle(`Int Filter Article ${RUN}`, c.id);

    const res = await api(`/admin/v1/articles?categoryId=${c.id}`, { cookie: editor });
    const body = await json<{ data: { id: string; categoryId: string }[] }>(res);
    expect(body.data.map(a => a.id)).toEqual([id]);
  });
});

describe('restore', () => {
  it('409s when a live category took the slug, and succeeds once it is free', async () => {
    const slug = `int-restore-${RUN}`;
    const original = await createCategory({ name: `Int Restore A ${RUN}`, slug });
    await retire(original.id);

    // Retiring freed the slug — the unique index is partial.
    const usurper = await createCategory({ name: `Int Restore B ${RUN}`, slug });

    const clash = await restore(original.id);
    expect(clash.status).toBe(409);
    expect((await json<ErrorBody>(clash)).error.code).toBe('CATEGORY_SLUG_TAKEN');

    await retire(usurper.id);
    const ok = await restore(original.id);
    expect(ok.status).toBe(200);
    expect((await json<CategoryBody>(ok)).retiredAt).toBeNull();
  });

  it('is idempotent on a live category', async () => {
    const c = await createCategory({ name: `Int Idempotent ${RUN}` });
    const res = await restore(c.id);
    expect(res.status).toBe(200);
    expect((await json<CategoryBody>(res)).position).toBe(c.position);
  });
});

describe('reorder', () => {
  it('applies a full order and refuses a partial, duplicated or foreign one', async () => {
    await createCategory({ name: `Int Order ${RUN}` });
    const live = (await listAll()).filter(c => !c.retiredAt);
    const original = live.map(c => c.id);
    const reversed = [...original].reverse();

    const post = (ids: string[], as = editor) => api('/admin/v1/categories/reorder', {
      method: 'POST', cookie: as, headers: JSON_HEADERS, body: JSON.stringify({ ids }),
    });

    try {
      const ok = await post(reversed);
      expect(ok.status).toBe(200);
      expect((await json<{ data: CategoryBody[] }>(ok)).data.map(c => c.id)).toEqual(reversed);

      const partial = await post(reversed.slice(1));
      expect(partial.status).toBe(409);
      const err = await json<ErrorBody>(partial);
      expect(err.error.code).toBe('CATEGORY_ORDER_STALE');
      expect(err.error.details?.missing).toEqual([reversed[0]]);

      expect((await post([...reversed, reversed[0]!])).status).toBe(409);

      // The same ids from the other tenant's session are all foreign to it.
      expect((await post(reversed, gaming)).status).toBe(409);
    }
    finally {
      // Put the seeded nav back the way it was.
      await post(original);
    }
  });
});

describe('slug changes leave a redirect', () => {
  it.skipIf(!TECH_KEY)('resolves old slugs to the CURRENT one, with no chains', async () => {
    const first = `int-move-a-${RUN}`;
    const c = await createCategory({ name: `Int Move ${RUN}`, slug: first });

    expect((await patchCategory(c.id, { slug: `int-move-b-${RUN}` })).status).toBe(200);
    expect((await patchCategory(c.id, { slug: `int-move-c-${RUN}` })).status).toBe(200);

    for (const old of [first, `int-move-b-${RUN}`]) {
      const res = await publicGet(`/categories/${old}`);
      expect(res.status).toBe(200);
      expect(await json<Resolution>(res)).toEqual({ kind: 'redirect', slug: `int-move-c-${RUN}` });
    }

    const live = await publicGet(`/categories/int-move-c-${RUN}`);
    expect(await json<Resolution>(live)).toMatchObject({ kind: 'category', name: `Int Move ${RUN}` });
  });

  it.skipIf(!TECH_KEY)('stops redirecting once the category is retired', async () => {
    const old = `int-gone-a-${RUN}`;
    const c = await createCategory({ name: `Int Gone ${RUN}`, slug: old });
    await patchCategory(c.id, { slug: `int-gone-b-${RUN}` });
    await retire(c.id);

    expect((await publicGet(`/categories/${old}`)).status).toBe(404);
    expect((await publicGet(`/categories/int-gone-b-${RUN}`)).status).toBe(404);
  });

  it.skipIf(!TECH_KEY)('lets a new live category reclaim a redirected slug', async () => {
    const old = `int-reclaim-${RUN}`;
    const moved = await createCategory({ name: `Int Reclaim Old ${RUN}`, slug: old });
    await patchCategory(moved.id, { slug: `int-reclaim-new-${RUN}` });

    await createCategory({ name: `Int Reclaim New ${RUN}`, slug: old });

    const res = await publicGet(`/categories/${old}`);
    expect(await json<Resolution>(res)).toMatchObject({ kind: 'category', name: `Int Reclaim New ${RUN}` });
  });

  it.skipIf(!TECH_KEY)('404s a slug that never existed', async () => {
    expect((await publicGet(`/categories/int-never-${RUN}`)).status).toBe(404);
  });

  it.skipIf(!TECH_KEY)('does not resolve another tenant\'s section', async () => {
    // Stays in categoryIds: afterAll's API retire 404s for it (tech session,
    // gaming row — isolation holding), and the SQL cleanup removes it anyway.
    const c = await createCategory({ name: `Int Gaming Only ${RUN}` }, gaming);
    try {
      expect((await publicGet(`/categories/${c.slug}`)).status).toBe(404);
    }
    finally {
      await retire(c.id, gaming);
    }
  });
});

describe('regressions', () => {
  it.skipIf(!TECH_KEY)('a retired and a recreated category with one slug do NOT merge publicly', async () => {
    // Reproduced before the fix: /category/<slug> listed both sections' articles.
    const slug = `int-merge-${RUN}`;
    const old = await createCategory({ name: `Int Merge Old ${RUN}`, slug });
    const oldArticle = await publishedArticle(`Int Merge Old Article ${RUN}`, old.id);
    await retire(old.id);

    const fresh = await createCategory({ name: `Int Merge New ${RUN}`, slug });
    const newArticle = await publishedArticle(`Int Merge New Article ${RUN}`, fresh.id);

    const res = await publicGet(`/articles?categorySlug=${slug}&perPage=100`);
    const ids = (await json<{ data: { id: string }[] }>(res)).data.map(a => a.id);
    expect(ids).toContain(newArticle);
    expect(ids).not.toContain(oldArticle);
  });

  it('an article in a retired category can still be saved', async () => {
    // Reproduced before the fix: every PATCH 404'd, even a title-only one,
    // because the editor re-sends the current categoryId.
    const c = await createCategory({ name: `Int Save ${RUN}` });
    const res = await api('/admin/v1/articles', {
      method: 'POST', cookie: editor, headers: JSON_HEADERS,
      body: JSON.stringify({ title: `Int Save Article ${RUN}`, categoryId: c.id }),
    });
    const { id } = await json<{ id: string }>(res);
    articleIds.push(id);
    await retire(c.id);

    const save = await api(`/admin/v1/articles/${id}`, {
      method: 'PATCH', cookie: editor, headers: JSON_HEADERS,
      body: JSON.stringify({ title: `Int Save Article Renamed ${RUN}`, categoryId: c.id }),
    });
    expect(save.status, await save.clone().text()).toBe(200);

    // But newly CHOOSING a retired category is still refused.
    const other = await createCategory({ name: `Int Save Other ${RUN}` });
    await retire(other.id);
    const choose = await api(`/admin/v1/articles/${id}`, {
      method: 'PATCH', cookie: editor, headers: JSON_HEADERS,
      body: JSON.stringify({ categoryId: other.id }),
    });
    expect(choose.status).toBe(404);
    expect((await json<ErrorBody>(choose)).error.code).toBe('CATEGORY_NOT_FOUND');
  });
});
