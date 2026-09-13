import type { TenantId } from '@core/shared';
import type { ArticleRepository, PublishedArticleRef, PublishingPipeline } from './ports';
import type { ReadershipAnalytics, ReadershipSite, ReadershipWindow } from './readership-ports';
import { localDate, type AnalyticsWindow } from '../domain/analytics-window';
import { articlePath, slugFromPath } from '../domain/readership';

/**
 * Assembles the dashboard's analytics: editorial figures from our database,
 * readership from the analytics store, joined by article path.
 *
 * The rules that live here rather than in a controller:
 *   - SCOPE: a contributor sees only their own articles ("mine"); editors and
 *     admins see the site. Decided from the role, never from input.
 *   - DEGRADE: no analytics website → "not-connected"; the store failing →
 *     "unavailable". Editorial figures are returned either way.
 *   - Readership is joined to articles in OUR database, so a path Umami knows
 *     but we do not (home, a deleted article, junk) is simply dropped.
 *
 * See docs/proposals/dashboard-analytics-umami.md §6 (Slice 6).
 */

export type DashboardArticleReads = Pick<
  ArticleRepository,
  'publishedBetween' | 'findPublishedBySlugs' | 'pipeline'
>;

export interface DashboardViewer {
  tenantId: TenantId;
  authorId: string;
  role: 'admin' | 'editor' | 'contributor';
}

export interface Delta {
  current: number;
  previous: number;
}

export interface TopArticle {
  article: PublishedArticleRef;
  views: number;
  /** Views per day, aligned to `window.days`. */
  daily: number[];
}

export interface CategoryShare {
  categoryId: string | null;
  name: string;
  retired: boolean;
  views: number;
  /** Fraction of ARTICLE views in scope; the list sums to exactly 1. */
  share: number;
}

export interface AuthorActivity {
  authorId: string;
  name: string;
  published: number;
  /** Null when readership is not available. */
  views: number | null;
}

export type ReadershipResult =
  | { status: 'not-connected' }
  | { status: 'unavailable'; cause: string }
  | {
    status: 'ok';
    views: Delta;
    /** Null for "mine": visitors cannot honestly be summed across pages. */
    visitors: Delta | null;
    firstWeekViewsPerNewArticle: number | null;
    daily: { date: string; views: number }[];
    topArticles: TopArticle[];
    byCategory: CategoryShare[];
    /** Null for "mine": sources are only known site-wide. */
    sources: { source: string; views: number }[] | null;
  };

export interface DashboardAnalytics {
  scope: 'site' | 'mine';
  window: AnalyticsWindow;
  editorial: {
    published: Delta;
    publishedByDay: { date: string; count: number }[];
    pipeline: PublishingPipeline;
  };
  /** Editor+ only; sorted by name, deliberately unranked (decision D3). */
  authors: AuthorActivity[] | null;
  readership: ReadershipResult;
}

const TOP_ARTICLES = 5;
const PATH_LIMIT = 500;
const SOURCE_LIMIT = 6;
/** A contributor's daily chart sums per-article series; capped to bound fan-out. */
const MINE_SERIES_CAP = 20;
const FIRST_WEEK_CAP = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface MappedViews {
  article: PublishedArticleRef;
  views: number;
}

export async function buildDashboardAnalytics(
  deps: { articles: DashboardArticleReads; readership: ReadershipAnalytics },
  input: {
    viewer: DashboardViewer;
    /** Null when the tenant has no analytics website — never built from input. */
    site: ReadershipSite | null;
    window: AnalyticsWindow;
    now: Date;
  },
): Promise<DashboardAnalytics> {
  const { viewer, site, window, now } = input;
  const scope = viewer.role === 'contributor' ? 'mine' : 'site';
  const onlyAuthor = scope === 'mine' ? viewer.authorId : undefined;

  const [published, publishedBefore, pipeline] = await Promise.all([
    deps.articles.publishedBetween(viewer.tenantId, window.current.from, window.current.to, { authorId: onlyAuthor }),
    deps.articles.publishedBetween(viewer.tenantId, window.previous.from, window.previous.to, { authorId: onlyAuthor }),
    deps.articles.pipeline(viewer.tenantId, { authorId: onlyAuthor }),
  ]);

  const editorial = {
    published: { current: published.length, previous: publishedBefore.length },
    publishedByDay: countByDay(window.days, published.map(a => localDate(a.publishedAt, window.timezone))),
    pipeline,
  };

  let readership: ReadershipResult = { status: 'not-connected' };
  let mapped: MappedViews[] | null = null;

  if (site) {
    try {
      const outcome = await readershipFor(deps, { site, window, now, onlyAuthor, published });
      readership = outcome.result;
      mapped = outcome.mapped;
    }
    catch (error) {
      // Any failure of the analytics store — down, slow, a response shape it
      // changed — degrades this block only. The editorial half is still true.
      readership = {
        status: 'unavailable',
        cause: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    scope,
    window,
    editorial,
    authors: scope === 'site' ? authorActivity(published, mapped) : null,
    readership,
  };
}

async function readershipFor(
  deps: { articles: DashboardArticleReads; readership: ReadershipAnalytics },
  input: {
    site: ReadershipSite;
    window: AnalyticsWindow;
    now: Date;
    onlyAuthor: string | undefined;
    published: PublishedArticleRef[];
  },
): Promise<{ result: ReadershipResult; mapped: MappedViews[] }> {
  const { readership, articles } = deps;
  const { site, window, now, onlyAuthor, published } = input;
  const current: ReadershipWindow = { ...window.current, timezone: window.timezone };
  const previous: ReadershipWindow = { ...window.previous, timezone: window.timezone };

  const mapPaths = async (rows: { path: string; views: number }[]): Promise<MappedViews[]> => {
    const bySlug = new Map<string, number>();
    for (const row of rows) {
      const slug = slugFromPath(row.path);
      if (slug) bySlug.set(slug, (bySlug.get(slug) ?? 0) + row.views);
    }
    if (bySlug.size === 0) return [];
    const refs = await articles.findPublishedBySlugs(site.tenantId, [...bySlug.keys()]);
    return refs
      .filter(article => !onlyAuthor || article.authorId === onlyAuthor)
      .map(article => ({ article, views: bySlug.get(article.slug) ?? 0 }))
      .sort((a, b) => b.views - a.views);
  };

  const seriesFor = (slug: string) => readership.daily(site, current, { path: articlePath(slug) });

  let views: Delta;
  let visitors: Delta | null = null;
  let sources: { source: string; views: number }[] | null = null;
  let daily: { date: string; views: number }[];
  let mapped: MappedViews[];

  if (!onlyAuthor) {
    const [now_, before, series, paths, src] = await Promise.all([
      readership.summary(site, current),
      readership.summary(site, previous),
      readership.daily(site, current),
      readership.byPath(site, current, PATH_LIMIT),
      readership.bySource(site, current, SOURCE_LIMIT),
    ]);
    mapped = await mapPaths(paths);
    views = { current: now_.views, previous: before.views };
    visitors = { current: now_.visitors, previous: before.visitors };
    sources = src;
    daily = series;
  }
  else {
    const [paths, pathsBefore] = await Promise.all([
      readership.byPath(site, current, PATH_LIMIT),
      readership.byPath(site, previous, PATH_LIMIT),
    ]);
    const [mine, mineBefore] = await Promise.all([mapPaths(paths), mapPaths(pathsBefore)]);
    mapped = mine;
    views = { current: sum(mine.map(m => m.views)), previous: sum(mineBefore.map(m => m.views)) };
    const series = await Promise.all(mine.slice(0, MINE_SERIES_CAP).map(m => seriesFor(m.article.slug)));
    daily = sumSeries(series);
  }

  const topArticles = await Promise.all(
    mapped.slice(0, TOP_ARTICLES).map(async m => ({
      article: m.article,
      views: m.views,
      daily: alignToDays(window.days, await seriesFor(m.article.slug)).map(d => d.views),
    })),
  );

  return {
    mapped,
    result: {
      status: 'ok',
      views,
      visitors,
      firstWeekViewsPerNewArticle: await firstWeekAverage(readership, site, published, now, window.timezone),
      daily: alignToDays(window.days, daily),
      topArticles,
      byCategory: categoryShares(mapped),
      sources,
    },
  };
}

/**
 * Average views an article got in its first seven days, over articles
 * published in the window whose first week is COMPLETE. An article published an
 * hour ago would otherwise pull the average toward zero every morning.
 */
async function firstWeekAverage(
  readership: ReadershipAnalytics,
  site: ReadershipSite,
  published: PublishedArticleRef[],
  now: Date,
  timezone: string,
): Promise<number | null> {
  const complete = published
    .filter(a => a.publishedAt.getTime() + WEEK_MS <= now.getTime())
    .slice(0, FIRST_WEEK_CAP);
  if (complete.length === 0) return null;

  const totals = await Promise.all(
    complete.map(a =>
      readership.summary(
        site,
        { from: a.publishedAt, to: new Date(a.publishedAt.getTime() + WEEK_MS), timezone },
        { path: articlePath(a.slug) },
      ),
    ),
  );
  return Math.round(sum(totals.map(t => t.views)) / complete.length);
}

function authorActivity(published: PublishedArticleRef[], mapped: MappedViews[] | null): AuthorActivity[] {
  const byAuthor = new Map<string, AuthorActivity>();
  const entry = (authorId: string, name: string) => {
    let found = byAuthor.get(authorId);
    if (!found) {
      found = { authorId, name, published: 0, views: mapped ? 0 : null };
      byAuthor.set(authorId, found);
    }
    return found;
  };

  for (const a of published) entry(a.authorId, a.authorName).published += 1;
  for (const m of mapped ?? []) {
    const e = entry(m.article.authorId, m.article.authorName);
    e.views = (e.views ?? 0) + m.views;
  }
  return [...byAuthor.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function categoryShares(mapped: MappedViews[]): CategoryShare[] {
  const groups = new Map<string, CategoryShare>();
  for (const { article, views } of mapped) {
    const key = article.categoryId ?? '';
    let group = groups.get(key);
    if (!group) {
      group = {
        categoryId: article.categoryId,
        name: article.categoryName ?? 'Uncategorised',
        retired: article.categoryRetired,
        views: 0,
        share: 0,
      };
      groups.set(key, group);
    }
    group.views += views;
  }

  const list = [...groups.values()].filter(g => g.views > 0).sort((a, b) => b.views - a.views);
  const fractions = shares(list.map(g => g.views));
  list.forEach((g, i) => { g.share = fractions[i] ?? 0; });
  return list;
}

/** Fractions to three places that sum to exactly 1 (largest remainder). */
export function shares(values: number[]): number[] {
  const total = sum(values);
  if (total === 0) return values.map(() => 0);

  const scaled = values.map(v => (v / total) * 1000);
  const floored = scaled.map(Math.floor);
  let remainder = 1000 - sum(floored);
  const byFraction = scaled
    .map((s, i) => ({ i, fraction: s - (floored[i] ?? 0) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { i } of byFraction) {
    if (remainder <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remainder -= 1;
  }
  return floored.map(f => f / 1000);
}

function countByDay(days: string[], dates: string[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1);
  return days.map(date => ({ date, count: counts.get(date) ?? 0 }));
}

/** Keyed by date, not position: an adapter's day list may differ at a midnight edge. */
function alignToDays(days: string[], series: { date: string; views: number }[]): { date: string; views: number }[] {
  const byDate = new Map(series.map(p => [p.date, p.views]));
  return days.map(date => ({ date, views: byDate.get(date) ?? 0 }));
}

function sumSeries(all: { date: string; views: number }[][]): { date: string; views: number }[] {
  const byDate = new Map<string, number>();
  for (const series of all) {
    for (const p of series) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.views);
  }
  return [...byDate].map(([date, views]) => ({ date, views }));
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
