import type { TenantId } from '@core/shared';

export const READERSHIP_ANALYTICS = Symbol('READERSHIP_ANALYTICS');

/**
 * Readership analytics — where views go after they are counted, and where the
 * dashboard reads traffic from. Implemented by Umami today
 * (infrastructure/umami-readership.analytics.ts); nothing outside that one file
 * knows it is Umami. See docs/proposals/dashboard-analytics-umami.md.
 *
 * NOT the source of truth for views: `article_views` is, and is written first.
 * This is a derived store that adds what the raw log lacks — sources,
 * visitors, devices, bot filtering.
 */

/**
 * The tenant's site as the analytics store knows it.
 *
 * TENANT ISOLATION: always built by the caller from the tenant row it already
 * resolved for this request — never from request input. An implementation must
 * only ever read or write `websiteId`, and must never choose a website itself.
 */
export interface ReadershipSite {
  tenantId: TenantId;
  websiteId: string;
  hostname: string;
}

export interface ReadershipWindow {
  from: Date;
  to: Date;
  /** IANA zone that decides where days begin. */
  timezone: string;
}

/**
 * One article read. `path` and `title` come from the article row, never from
 * the client, so nobody can write arbitrary URLs into a tenant's analytics.
 * `ip` and `userAgent` are passed through for geo, device and bot detection,
 * and are never stored or logged by us.
 */
export interface ReadershipHit {
  path: string;
  title: string;
  referrer?: string | null;
  language?: string;
  screen?: string;
  ip?: string;
  userAgent?: string;
  /**
   * When the read happened. Live views never set it — the analytics store uses
   * its own clock. Exists for the dev seed (`task db:seed:views`), which
   * backfills history through this same ingest path rather than around it.
   */
  at?: Date;
}

export interface ReadershipSummary {
  views: number;
  visitors: number;
}

/**
 * The analytics store is down, slow or misconfigured. Callers degrade — the
 * dashboard shows editorial figures only; recording a view carries on.
 * Deliberately not a DomainError: it must never become an HTTP error status.
 */
export class ReadershipUnavailableError extends Error {
  constructor(reason: string) {
    super(`Readership analytics unavailable: ${reason}`);
    this.name = 'ReadershipUnavailableError';
  }
}

export interface ReadershipAnalytics {
  /** Best effort. Resolves or rejects; the caller never awaits it on a response path. */
  track(site: ReadershipSite, hit: ReadershipHit): Promise<void>;

  summary(site: ReadershipSite, window: ReadershipWindow, filter?: { path?: string }): Promise<ReadershipSummary>;

  /** DENSE: one entry for every local day in the window, zero included. */
  daily(
    site: ReadershipSite,
    window: ReadershipWindow,
    filter?: { path?: string },
  ): Promise<{ date: string; views: number }[]>;

  /** Views per URL path, most viewed first. */
  byPath(site: ReadershipSite, window: ReadershipWindow, limit: number): Promise<{ path: string; views: number }[]>;

  /** Views per traffic source (normalised referrer domain, plus direct/internal), most first. */
  bySource(site: ReadershipSite, window: ReadershipWindow, limit: number): Promise<{ source: string; views: number }[]>;
}
