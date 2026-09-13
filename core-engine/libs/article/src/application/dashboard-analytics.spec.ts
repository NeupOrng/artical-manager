import { describe, it, expect, beforeEach } from 'vitest';
import { asTenantId } from '@core/shared';
import { buildDashboardAnalytics, shares, type DashboardArticleReads, type DashboardViewer } from './dashboard-analytics';
import { ReadershipUnavailableError } from './readership-ports';
import type { PublishedArticleRef } from './ports';
import { analyticsWindow } from '../domain/analytics-window';
import { FakeReadershipAnalytics } from '../testing/fake-readership-analytics';

// Application tests over in-memory ports — no database, no Umami.

const TENANT = asTenantId('tenant-tech');
const SITE = { tenantId: TENANT, websiteId: 'web-tech', hostname: 'tech.example' };
const NOW = new Date('2026-09-12T12:00:00Z');
const WINDOW = analyticsWindow('30d', NOW, 'UTC');
const day = (d: string, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00Z`);

const MARA = 'author-mara';
const NINA = 'author-nina';

const ref = (over: Partial<PublishedArticleRef> & Pick<PublishedArticleRef, 'slug'>): PublishedArticleRef => ({
  id: `id-${over.slug}`,
  title: over.slug,
  authorId: MARA,
  authorName: 'Mara Okonkwo',
  categoryId: 'cat-guides',
  categoryName: 'Guides',
  categoryRetired: false,
  publishedAt: day('2026-08-20'),
  ...over,
});

const ARTICLES: PublishedArticleRef[] = [
  ref({ slug: 'battery-specs', publishedAt: day('2026-08-20') }),
  ref({ slug: 'laptop-verdict', authorId: NINA, authorName: 'Nina Sato', categoryId: 'cat-reviews', categoryName: 'Reviews', publishedAt: day('2026-09-08') }),
  ref({ slug: 'old-news', categoryId: 'cat-news', categoryName: 'News', categoryRetired: true, publishedAt: day('2026-06-01') }),
  ref({ slug: 'no-section', categoryId: null, categoryName: null, publishedAt: day('2026-09-01') }),
];

const reads: DashboardArticleReads = {
  publishedBetween: async (_t, from, to, options = {}) =>
    ARTICLES
      .filter(a => a.publishedAt >= from && a.publishedAt < to && (!options.authorId || a.authorId === options.authorId))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
  findPublishedBySlugs: async (_t, slugs) => ARTICLES.filter(a => slugs.includes(a.slug)),
  pipeline: async () => ({ ready: 2, needsExcerpt: 1, needsCover: 1, lastPublishedAt: day('2026-09-08') }),
};

const editor: DashboardViewer = { tenantId: TENANT, authorId: MARA, role: 'editor' };
const contributor: DashboardViewer = { tenantId: TENANT, authorId: NINA, role: 'contributor' };

let readership: FakeReadershipAnalytics;
const hit = (path: string, at: Date, source?: string, websiteId = SITE.websiteId) =>
  readership.hits.push({ websiteId, path, at, source });

beforeEach(() => {
  readership = new FakeReadershipAnalytics();
  for (let i = 0; i < 6; i++) hit('/article/battery-specs', day('2026-08-21', i), 'facebook.com');
  for (let i = 0; i < 3; i++) hit('/article/laptop-verdict', day('2026-09-09', i));
  hit('/article/old-news', day('2026-09-02'));
  hit('/article/no-section', day('2026-09-03'));
  hit('/', day('2026-09-04')); // home page — not an article
  hit('/article/deleted-long-ago', day('2026-09-05')); // unknown to our database
  hit('/article/battery-specs', day('2026-08-01')); // previous window
  hit('/article/battery-specs', day('2026-09-10'), undefined, 'web-gaming'); // ANOTHER tenant's website
});

const build = (viewer: DashboardViewer, site: typeof SITE | null = SITE) =>
  buildDashboardAnalytics({ articles: reads, readership }, { viewer, site, window: WINDOW, now: NOW });

describe('site scope (editor)', () => {
  it('counts views and compares with the previous window', async () => {
    const a = await build(editor);
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    // 13 hits in the window on this website, including the home page and the
    // unknown path — site totals are Umami's; only the article joins drop them.
    expect(a.readership.views).toEqual({ current: 13, previous: 1 });
    expect(a.scope).toBe('site');
  });

  it('never counts another tenant\'s website', async () => {
    const a = await build(editor);
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    const battery = a.readership.topArticles.find(t => t.article.slug === 'battery-specs');
    expect(battery?.views).toBe(6);
  });

  it('ranks top articles and drops paths that are not our articles', async () => {
    const a = await build(editor);
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    expect(a.readership.topArticles.map(t => t.article.slug))
      .toEqual(['battery-specs', 'laptop-verdict', 'old-news', 'no-section']);
    expect(a.readership.topArticles[0]!.daily).toHaveLength(30);
  });

  it('groups by category, labels retired and uncategorised, and shares sum to 1', async () => {
    const a = await build(editor);
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    const byName = Object.fromEntries(a.readership.byCategory.map(c => [c.name, c]));
    expect(byName.Guides?.views).toBe(6);
    expect(byName.News?.retired).toBe(true);
    expect(byName.Uncategorised?.categoryId).toBeNull();
    expect(a.readership.byCategory.reduce((t, c) => t + c.share, 0)).toBeCloseTo(1, 10);
  });

  it('lists authors by name, unranked, with published counts and views', async () => {
    const a = await build(editor);
    expect(a.authors).toEqual([
      { authorId: MARA, name: 'Mara Okonkwo', published: 2, views: 8 },
      { authorId: NINA, name: 'Nina Sato', published: 1, views: 3 },
    ]);
  });

  it('averages first-week views over articles whose first week is complete', async () => {
    const a = await build(editor);
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    // battery-specs (6) and no-section (1) have a full week; laptop-verdict
    // (published four days ago) is excluded rather than dragging the mean down.
    expect(a.readership.firstWeekViewsPerNewArticle).toBe(4);
  });

  it('buckets publications by local day, densely', async () => {
    const a = await build(editor);
    expect(a.editorial.publishedByDay).toHaveLength(30);
    expect(a.editorial.publishedByDay.find(d => d.date === '2026-09-08')?.count).toBe(1);
    expect(a.editorial.published.current).toBe(3);
  });
});

describe('mine scope (contributor)', () => {
  it('sees only their own articles, and nothing site-wide', async () => {
    const a = await build(contributor);
    expect(a.scope).toBe('mine');
    expect(a.authors).toBeNull();
    if (a.readership.status !== 'ok') throw new Error('expected ok');
    expect(a.readership.topArticles.map(t => t.article.slug)).toEqual(['laptop-verdict']);
    expect(a.readership.views.current).toBe(3);
    expect(a.readership.visitors).toBeNull();
    expect(a.readership.sources).toBeNull();
    expect(a.readership.byCategory.map(c => c.name)).toEqual(['Reviews']);
    expect(a.editorial.published.current).toBe(1);
  });
});

describe('degrading', () => {
  it('reports not-connected without a website, and still returns editorial figures', async () => {
    const a = await build(editor, null);
    expect(a.readership).toEqual({ status: 'not-connected' });
    expect(a.editorial.pipeline.ready).toBe(2);
    expect(a.authors?.every(x => x.views === null)).toBe(true);
  });

  it('reports unavailable when the store fails, and still returns editorial figures', async () => {
    readership.failWith = new ReadershipUnavailableError('GET /api/websites/x/stats timed out');
    const a = await build(editor);
    expect(a.readership.status).toBe('unavailable');
    expect(a.editorial.published.current).toBe(3);
  });
});

describe('shares', () => {
  it('sums to exactly 1 even when thirds do not', () => {
    expect(shares([1, 1, 1]).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(shares([0, 0])).toEqual([0, 0]);
  });
});
