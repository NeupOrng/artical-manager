import type {
  ReadershipAnalytics,
  ReadershipHit,
  ReadershipSite,
  ReadershipSummary,
  ReadershipWindow,
} from '../application/readership-ports';
import { localDate, localDaysIn } from '../domain/analytics-window';

/**
 * In-memory ReadershipAnalytics for application tests. Hits are plain rows;
 * every read filters by website id first, the same boundary the real store
 * has. Not exported from the lib index — test code imports it by path.
 */
export interface FakeHit {
  websiteId: string;
  path: string;
  at: Date;
  source?: string;
  visitor?: string;
}

export class FakeReadershipAnalytics implements ReadershipAnalytics {
  hits: FakeHit[] = [];
  tracked: { site: ReadershipSite; hit: ReadershipHit }[] = [];
  /** Set to make every read fail, as a dead store would. */
  failWith: Error | null = null;

  private select(site: ReadershipSite, w: ReadershipWindow, path?: string): FakeHit[] {
    if (this.failWith) throw this.failWith;
    return this.hits.filter(h =>
      h.websiteId === site.websiteId
      && h.at >= w.from
      && h.at < w.to
      && (!path || h.path === path));
  }

  async track(site: ReadershipSite, hit: ReadershipHit): Promise<void> {
    this.tracked.push({ site, hit });
  }

  async summary(site: ReadershipSite, w: ReadershipWindow, filter: { path?: string } = {}): Promise<ReadershipSummary> {
    const hits = this.select(site, w, filter.path);
    return {
      views: hits.length,
      visitors: new Set(hits.map((h, i) => h.visitor ?? `anon-${i}`)).size,
    };
  }

  async daily(site: ReadershipSite, w: ReadershipWindow, filter: { path?: string } = {}) {
    const hits = this.select(site, w, filter.path);
    return localDaysIn(w, w.timezone).map(date => ({
      date,
      views: hits.filter(h => localDate(h.at, w.timezone) === date).length,
    }));
  }

  async byPath(site: ReadershipSite, w: ReadershipWindow, limit: number) {
    return tally(this.select(site, w).map(h => h.path), limit).map(([path, views]) => ({ path, views }));
  }

  async bySource(site: ReadershipSite, w: ReadershipWindow, limit: number) {
    return tally(this.select(site, w).map(h => h.source ?? 'Direct / internal'), limit)
      .map(([source, views]) => ({ source, views }));
  }
}

function tally(keys: string[], limit: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
