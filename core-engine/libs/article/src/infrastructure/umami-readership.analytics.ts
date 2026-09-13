import {
  ReadershipUnavailableError,
  type ReadershipAnalytics,
  type ReadershipHit,
  type ReadershipSite,
  type ReadershipSummary,
  type ReadershipWindow,
} from '../application/readership-ports';
import { localDaysIn } from '../domain/analytics-window';

/**
 * ReadershipAnalytics over Umami's HTTP API.
 *
 * WRITTEN AGAINST UMAMI 3.3.1 — the image pinned in
 * infrastructure/compose/docker-compose.yml. Verified by probing that version
 * (2026-09-12):
 *   - POST /api/send honours `ip`, `userAgent` and `timestamp` in the payload
 *     over request headers; a bot user agent returns 200 and stores nothing.
 *   - Umami stores no raw IP (session keeps country/region/city only).
 *   - /stats → { pageviews, visitors, … }; /pageviews → { pageviews: [{x, y}] }
 *     with ONLY days that have data, `x` formatted "YYYY-MM-DDT00:00:00Z" for
 *     UTC and "YYYY-MM-DD 00:00:00" otherwise; /metrics?type=path|referrer →
 *     [{x, y}]. A `path` query param filters stats and pageviews.
 *   - Auth: POST /api/auth/login → { token }, then `Authorization: Bearer`.
 * Bumping the image means re-running the adapter contract test.
 *
 * Everything Umami-specific stays in this file.
 */

export interface UmamiConfig {
  /** Internal URL — umami:3000 on the compose network. Never public. */
  url: string;
  username: string;
  password: string;
}

/** The source label for views with no external referrer. Same-site clicks land here too. */
export const DIRECT_SOURCE = 'Direct / internal';

const READ_TIMEOUT_MS = 2_000;
const TRACK_TIMEOUT_MS = 1_500;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

/**
 * Collapses the many hostnames one source arrives from. Facebook alone sends
 * readers from facebook.com, m., l., lm. and web. — five rows for one channel.
 */
export function normaliseSource(domain: string): string {
  const host = domain.trim().toLowerCase().replace(/^www\./, '');
  const is = (root: string) => host === root || host.endsWith(`.${root}`);

  if (is('facebook.com') || host === 'fb.com' || host === 'fb.me') return 'facebook.com';
  if (host === 't.co' || is('twitter.com') || is('x.com')) return 'x.com';
  if (/^(?:.+\.)?google\.[a-z.]+$/.test(host)) return 'google.com';
  if (is('instagram.com')) return 'instagram.com';
  if (host === 'lnkd.in' || is('linkedin.com')) return 'linkedin.com';
  if (is('bing.com')) return 'bing.com';
  return host;
}

interface Point { x: string; y: number }

type Fetch = typeof fetch;

export class UmamiReadershipAnalytics implements ReadershipAnalytics {
  private token: string | null = null;
  private loggingIn: Promise<string> | null = null;
  private readonly cache = new Map<string, { expires: number; value: unknown }>();

  constructor(
    private readonly config: UmamiConfig,
    private readonly http: Fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async track(site: ReadershipSite, hit: ReadershipHit): Promise<void> {
    await this.call('/api/send', {
      method: 'POST',
      authenticated: false,
      timeoutMs: TRACK_TIMEOUT_MS,
      // Umami prefers the payload's userAgent, but reads the header when it is
      // absent — so the header is the reader's too, never this server's.
      headers: hit.userAgent ? { 'User-Agent': hit.userAgent } : {},
      body: {
        type: 'event',
        payload: {
          website: site.websiteId,
          hostname: site.hostname,
          url: hit.path,
          title: hit.title,
          referrer: hit.referrer ?? '',
          language: hit.language,
          screen: hit.screen,
          ip: hit.ip,
          userAgent: hit.userAgent,
          // Seconds, per Umami; omitted for live views so its clock decides.
          ...(hit.at ? { timestamp: Math.floor(hit.at.getTime() / 1000) } : {}),
        },
      },
    });
  }

  async summary(site: ReadershipSite, window: ReadershipWindow, filter: { path?: string } = {}): Promise<ReadershipSummary> {
    const stats = await this.report<{ pageviews: number; visitors: number }>(
      site, 'stats', window, filter.path ? { path: filter.path } : {},
    );
    return { views: stats.pageviews ?? 0, visitors: stats.visitors ?? 0 };
  }

  async daily(site: ReadershipSite, window: ReadershipWindow, filter: { path?: string } = {}) {
    const series = await this.report<{ pageviews: Point[] }>(site, 'pageviews', window, {
      unit: 'day',
      timezone: window.timezone,
      ...(filter.path ? { path: filter.path } : {}),
    });
    // Umami omits empty days and formats the date differently per zone; the
    // first ten characters are the local date either way.
    const byDate = new Map(series.pageviews.map(p => [p.x.slice(0, 10), p.y]));
    return localDaysIn(window, window.timezone).map(date => ({ date, views: byDate.get(date) ?? 0 }));
  }

  async byPath(site: ReadershipSite, window: ReadershipWindow, limit: number) {
    const rows = await this.report<Point[]>(site, 'metrics', window, { type: 'path', limit });
    return rows.map(r => ({ path: r.x, views: r.y }));
  }

  async bySource(site: ReadershipSite, window: ReadershipWindow, limit: number) {
    const [referrers, total] = await Promise.all([
      this.report<Point[]>(site, 'metrics', window, { type: 'referrer', limit: 200 }),
      this.summary(site, window),
    ]);

    const merged = new Map<string, number>();
    for (const r of referrers) {
      const source = normaliseSource(r.x);
      merged.set(source, (merged.get(source) ?? 0) + r.y);
    }

    // Umami's referrer metric leaves out views with no referrer. Deriving the
    // remainder from total pageviews keeps every row in the same unit, which
    // its `channel` metric does not guarantee.
    const referred = [...merged.values()].reduce((a, b) => a + b, 0);
    const direct = Math.max(0, total.views - referred);
    if (direct > 0) merged.set(DIRECT_SOURCE, direct);

    return [...merged]
      .map(([source, views]) => ({ source, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  private async report<T>(
    site: ReadershipSite,
    endpoint: 'stats' | 'pageviews' | 'metrics',
    window: ReadershipWindow,
    params: Record<string, string | number>,
  ): Promise<T> {
    // `to` is usually "now", which would make every cache key unique. Rounding
    // the end up to the next minute makes a minute's worth of requests share
    // one answer; the extra seconds contain no data yet.
    const endAt = Math.ceil(window.to.getTime() / 60_000) * 60_000;
    const query = new URLSearchParams({
      startAt: String(window.from.getTime()),
      endAt: String(endAt),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    const path = `/api/websites/${encodeURIComponent(site.websiteId)}/${endpoint}?${query}`;

    const cached = this.cache.get(path);
    if (cached && cached.expires > this.clock()) return cached.value as T;

    const value = await this.call<T>(path, { timeoutMs: READ_TIMEOUT_MS });

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(path, { expires: this.clock() + CACHE_TTL_MS, value });
    return value;
  }

  private async call<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs: number;
      authenticated?: boolean;
    },
    retried = false,
  ): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };
    if (authenticated) headers.Authorization = `Bearer ${await this.getToken()}`;

    let res: Response;
    try {
      res = await this.http(`${this.config.url}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    }
    catch (error) {
      // Messages carry the endpoint and cause only — never the payload, which
      // holds a reader's IP address and user agent.
      const cause = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable';
      throw new ReadershipUnavailableError(`${options.method ?? 'GET'} ${path.split('?')[0]} ${cause}`);
    }

    // A token can be invalidated (Umami restarted with a new APP_SECRET, or the
    // password rotated). Log in again once, then give up.
    if (res.status === 401 && authenticated && !retried) {
      this.token = null;
      return this.call<T>(path, options, true);
    }

    if (!res.ok) {
      throw new ReadershipUnavailableError(`${options.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}`);
    }

    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    // One login in flight at a time: a dashboard load fans out into parallel
    // reports, and each would otherwise log in separately.
    this.loggingIn ??= this.login().finally(() => { this.loggingIn = null; });
    this.token = await this.loggingIn;
    return this.token;
  }

  private async login(): Promise<string> {
    const { token } = await this.call<{ token: string }>('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      timeoutMs: READ_TIMEOUT_MS,
      body: { username: this.config.username, password: this.config.password },
    });
    if (!token) throw new ReadershipUnavailableError('login returned no token');
    return token;
  }
}

/**
 * Stands in when Umami is not configured (no UMAMI_URL). Recording carries on
 * without it; reads report "unavailable" rather than inventing zeros.
 */
export class DisabledReadershipAnalytics implements ReadershipAnalytics {
  async track(): Promise<void> {}
  private unavailable(): never {
    throw new ReadershipUnavailableError('not configured (UMAMI_URL is unset)');
  }
  summary(): Promise<ReadershipSummary> { return Promise.resolve().then(() => this.unavailable()); }
  daily(): Promise<{ date: string; views: number }[]> { return Promise.resolve().then(() => this.unavailable()); }
  byPath(): Promise<{ path: string; views: number }[]> { return Promise.resolve().then(() => this.unavailable()); }
  bySource(): Promise<{ source: string; views: number }[]> { return Promise.resolve().then(() => this.unavailable()); }
}
