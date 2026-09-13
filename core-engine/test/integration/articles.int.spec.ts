import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api, signIn, SEED } from './helpers/session';

/**
 * The article admin surface, through the real gateway.
 *
 * These write to the seeded database, so every article created here is deleted
 * in afterAll — a leftover row would drift the dashboard counts that other
 * tests assert on.
 */

let cookie: string;
let gamingCookie: string;
const created: string[] = [];

/**
 * The response shapes these tests assert on. Written out rather than reaching
 * for `any`: a field renamed in the API should fail here at typecheck, which is
 * half the point of having the contract in api-reference.md.
 */
interface ArticleBody {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  missingToPublish: ('excerpt' | 'coverImage')[];
}

interface ErrorBody {
  error: { code: string; message: string };
}

interface ListBody {
  data: ArticleBody[];
  meta: { page: number; perPage: number; total: number };
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;

async function createDraft(body: Record<string, unknown>, as = cookie) {
  const res = await api('/admin/v1/articles', {
    method: 'POST',
    cookie: as,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

beforeAll(async () => {
  cookie = await signIn(SEED.techAuthor);
  gamingCookie = await signIn(SEED.gamingAuthor);
}, 45_000);

afterAll(async () => {
  for (const id of created) {
    await api(`/admin/v1/articles/${id}`, { method: 'DELETE', cookie });
  }
});

describe('creating', () => {
  it('creates a draft and derives the slug from the title', async () => {
    const res = await createDraft({ title: 'A Test Draft From Integration' });
    expect(res.status).toBe(201);

    const article = await json<ArticleBody>(res);
    created.push(article.id);

    expect(article.status).toBe('draft');
    expect(article.slug).toBe('a-test-draft-from-integration');
    expect(article.publishedAt).toBeNull();
    // The UI needs this to show the requirement while writing rather than as a
    // 422 at the moment someone hits publish.
    expect(article.missingToPublish).toEqual(['excerpt', 'coverImage']);
  });

  it('takes authorship from the SESSION, not the body', async () => {
    // A contributor must not be able to publish under someone else's byline.
    const res = await createDraft({
      title: 'Authorship Comes From The Session',
      authorId: '00000000-0000-0000-0000-000000000999',
    });
    // forbidNonWhitelisted rejects the unknown field outright.
    expect(res.status).toBe(400);
  });

  it('409s a slug already used on this site', async () => {
    const first = await createDraft({ title: 'Duplicate Slug Probe' });
    created.push((await json<ArticleBody>(first)).id);

    const second = await createDraft({ title: 'Duplicate Slug Probe' });
    expect(second.status).toBe(409);
    expect((await json<ErrorBody>(second)).error.code).toBe('ARTICLE_DUPLICATE_SLUG');
  });

  it('allows the SAME slug in a different tenant', async () => {
    // Slugs collide across tenants by design — both sites may publish
    // /best-laptops-2026. A global unique here would be a correctness bug.
    const res = await createDraft(
      { title: 'Duplicate Slug Probe' },
      gamingCookie,
    );
    expect(res.status).toBe(201);

    const article = await json<ArticleBody>(res);
    await api(`/admin/v1/articles/${article.id}`, {
      method: 'DELETE',
      cookie: gamingCookie,
    });
  });

  it('422s an unsluggable title', async () => {
    const res = await createDraft({ title: '!!! ???' });
    expect(res.status).toBe(422);
    expect((await json<ErrorBody>(res)).error.code).toBe('ARTICLE_UNSLUGGABLE_TITLE');
  });
});

describe('tenant isolation', () => {
  let techArticleId: string;

  beforeAll(async () => {
    const res = await createDraft({ title: 'Tenant Isolation Probe' });
    techArticleId = (await json<ArticleBody>(res)).id;
    created.push(techArticleId);
  });

  it('404s another tenant reading it — never 403', async () => {
    // 403 would confirm the article exists. 404 is the only answer that does
    // not leak across the boundary. docs/tenant-isolation.md.
    const res = await api(`/admin/v1/articles/${techArticleId}`, {
      cookie: gamingCookie,
    });
    expect(res.status).toBe(404);
  });

  it('404s another tenant editing it', async () => {
    const res = await api(`/admin/v1/articles/${techArticleId}`, {
      method: 'PATCH',
      cookie: gamingCookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hijacked' }),
    });
    expect(res.status).toBe(404);

    // And the article is untouched.
    const check = await api(`/admin/v1/articles/${techArticleId}`, { cookie });
    expect((await json<ArticleBody>(check)).title).toBe('Tenant Isolation Probe');
  });

  it("does not show another tenant's articles in the list", async () => {
    const res = await api('/admin/v1/articles?perPage=100', {
      cookie: gamingCookie,
    });
    const body = await json<ListBody>(res);
    const ids = body.data.map(a => a.id);
    expect(ids).not.toContain(techArticleId);
  });
});

describe('category assignment is tenant-scoped', () => {
  let articleId: string;
  let ownCategoryId: string;
  let foreignCategoryId: string;

  beforeAll(async () => {
    articleId = (await json<ArticleBody>(await createDraft({ title: 'Category Scope Probe' }))).id;
    created.push(articleId);

    const own = await json<{ data: { id: string }[] }>(
      await api('/admin/v1/categories', { cookie }),
    );
    const foreign = await json<{ data: { id: string }[] }>(
      await api('/admin/v1/categories', { cookie: gamingCookie }),
    );
    ownCategoryId = own.data[0]!.id;
    foreignCategoryId = foreign.data[0]!.id;
  });

  it('accepts a category from the caller\'s own tenant', async () => {
    const res = await api(`/admin/v1/articles/${articleId}`, {
      method: 'PATCH',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: ownCategoryId }),
    });
    expect(res.status).toBe(200);
  });

  it("404s ANOTHER tenant's category id", async () => {
    // The foreign key on articles.category_id references categories.id and
    // knows nothing about tenancy, so Postgres accepts this happily. Before the
    // controller checked, this returned 200 and stored a gaming category on a
    // technology article.
    //
    // 404 rather than 403: a 403 would confirm the id exists somewhere else.
    const res = await api(`/admin/v1/articles/${articleId}`, {
      method: 'PATCH',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: foreignCategoryId }),
    });
    expect(res.status).toBe(404);
    expect((await json<ErrorBody>(res)).error.code).toBe('CATEGORY_NOT_FOUND');

    // And the article kept the category it already had.
    const after = await json<ArticleBody & { categoryId: string | null }>(
      await api(`/admin/v1/articles/${articleId}`, { cookie }),
    );
    expect(after.categoryId).toBe(ownCategoryId);
  });

  it('refuses a foreign category at CREATE time too', async () => {
    const res = await createDraft({
      title: 'Category Scope Probe At Create',
      categoryId: foreignCategoryId,
    });
    expect(res.status).toBe(404);
  });

  it('allows clearing the category', async () => {
    const res = await api(`/admin/v1/articles/${articleId}`, {
      method: 'PATCH',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: null }),
    });
    expect(res.status).toBe(200);
    expect((await json<{ categoryId: string | null }>(res)).categoryId).toBeNull();
  });
});

describe('publishing', () => {
  let id: string;

  beforeAll(async () => {
    const res = await createDraft({ title: 'Publish Flow Probe' });
    id = (await json<ArticleBody>(res)).id;
    created.push(id);
  });

  it('422s publishing without an excerpt or cover image', async () => {
    // Both feed the share preview, which is the product's whole promise.
    const res = await api(`/admin/v1/articles/${id}/publish`, {
      method: 'POST',
      cookie,
    });
    expect(res.status).toBe(422);
    expect((await json<ErrorBody>(res)).error.code).toBe('ARTICLE_MISSING_EXCERPT');
  });

  it('publishes once both are present, and is idempotent', async () => {
    await api(`/admin/v1/articles/${id}`, {
      method: 'PATCH',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excerpt: 'A real excerpt for the share preview.',
        coverImage: 'http://localhost:9000/media/seed/probe.jpg',
      }),
    });

    const first = await api(`/admin/v1/articles/${id}/publish`, {
      method: 'POST',
      cookie,
    });
    expect(first.status).toBe(201);
    const published = await json<ArticleBody>(first);
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();

    // Re-publishing must not move the canonical date — it feeds
    // article:published_time and the public sort order.
    const again = await api(`/admin/v1/articles/${id}/publish`, {
      method: 'POST',
      cookie,
    });
    expect((await json<ArticleBody>(again)).publishedAt).toBe(published.publishedAt);
  });

  it('refuses to change the slug of a published article', async () => {
    const res = await api(`/admin/v1/articles/${id}`, {
      method: 'PATCH',
      cookie,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'a-different-slug' }),
    });
    expect(res.status).toBe(409);
    expect((await json<ErrorBody>(res)).error.code).toBe('ARTICLE_SLUG_LOCKED');
  });

  it('keeps publishedAt after unpublishing', async () => {
    const before = await json<ArticleBody>(await api(`/admin/v1/articles/${id}`, { cookie }));

    const res = await api(`/admin/v1/articles/${id}/unpublish`, {
      method: 'POST',
      cookie,
    });
    const after = await json<ArticleBody>(res);

    expect(after.status).toBe('draft');
    // Deliberately preserved: it is the canonical FIRST publication date.
    expect(after.publishedAt).toBe(before.publishedAt);
  });
});

describe('the public surface never sees a draft', () => {
  it('does not return a newly created draft by slug', async () => {
    const res = await createDraft({ title: 'Draft Never Public Probe' });
    const article = await json<ArticleBody>(res);
    created.push(article.id);

    const key = process.env.TECH_TENANT_KEY;
    if (!key) return;

    const pub = await api(`/public/v1/articles/${article.slug}`, {
      headers: { 'X-Tenant-Key': key },
    });
    // A 200 here is a content leak, not a caching quirk.
    expect(pub.status).toBe(404);
  });
});

describe('filtering', () => {
  it('filters by status in SQL, not by the caller', async () => {
    const res = await api('/admin/v1/articles?status=draft&perPage=100', {
      cookie,
    });
    const body = await json<ListBody>(res);

    expect(body.data.length).toBeGreaterThan(0);
    for (const a of body.data) expect(a.status).toBe('draft');
  });

  it('searches titles without treating % as a wildcard', async () => {
    // An unescaped term would match everything and look like a working search.
    const res = await api('/admin/v1/articles?search=%25', { cookie });
    const body = await json<ListBody>(res);
    expect(body.data.length).toBe(0);
  });
});
