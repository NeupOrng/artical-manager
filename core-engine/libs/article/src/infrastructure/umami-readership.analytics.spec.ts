import { describe, it, expect } from 'vitest';
import { asTenantId } from '@core/shared';
import { ReadershipUnavailableError } from '../application/readership-ports';
import {
  DIRECT_SOURCE,
  DisabledReadershipAnalytics,
  UmamiReadershipAnalytics,
  normaliseSource,
} from './umami-readership.analytics';

const SITE = { tenantId: asTenantId('t1'), websiteId: 'w1', hostname: 'tech.example' };
const WINDOW = {
  from: new Date('2026-09-10T00:00:00Z'),
  to: new Date('2026-09-13T00:00:00Z'),
  timezone: 'UTC',
};

/** A scripted Umami: routes by pathname, records every call. */
function fakeUmami(routes: Record<string, (req: Request) => Response | Promise<Response>>) {
  const calls: Request[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push(req);
    const route = routes[new URL(req.url).pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route(req);
  }) as typeof fetch;
  return { http, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const login = () => json({ token: 'tok' });

const make = (http: typeof fetch, clock = () => 0) =>
  new UmamiReadershipAnalytics({ url: 'http://umami', username: 'u', password: 'p' }, http, clock);

describe('normaliseSource', () => {
  it('collapses the hostnames one source arrives from', () => {
    for (const d of ['facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'www.facebook.com']) {
      expect(normaliseSource(d)).toBe('facebook.com');
    }
    expect(normaliseSource('t.co')).toBe('x.com');
    expect(normaliseSource('google.com.kh')).toBe('google.com');
    expect(normaliseSource('news.google.com')).toBe('google.com');
  });

  it('does not match lookalikes', () => {
    expect(normaliseSource('notfacebook.com')).toBe('notfacebook.com');
    expect(normaliseSource('notgoogle.com')).toBe('notgoogle.com');
  });
});

describe('daily', () => {
  it('fills the days Umami leaves out, whatever its date format', async () => {
    const { http } = fakeUmami({
      '/api/auth/login': login,
      '/api/websites/w1/pageviews': () => json({
        pageviews: [
          { x: '2026-09-10T00:00:00Z', y: 4 }, // UTC format
          { x: '2026-09-12 00:00:00', y: 2 }, // zoned format
        ],
      }),
    });

    expect(await make(http).daily(SITE, WINDOW)).toEqual([
      { date: '2026-09-10', views: 4 },
      { date: '2026-09-11', views: 0 },
      { date: '2026-09-12', views: 2 },
    ]);
  });
});

describe('bySource', () => {
  it('merges hostnames and derives direct/internal from the total', async () => {
    const { http } = fakeUmami({
      '/api/auth/login': login,
      '/api/websites/w1/metrics': () => json([
        { x: 'l.facebook.com', y: 5 },
        { x: 'm.facebook.com', y: 3 },
        { x: 'google.com', y: 2 },
      ]),
      '/api/websites/w1/stats': () => json({ pageviews: 14, visitors: 9 }),
    });

    expect(await make(http).bySource(SITE, WINDOW, 5)).toEqual([
      { source: 'facebook.com', views: 8 },
      { source: DIRECT_SOURCE, views: 4 },
      { source: 'google.com', views: 2 },
    ]);
  });
});

describe('transport', () => {
  it('logs in once and re-logs in once on a 401', async () => {
    let statsCalls = 0;
    const { http, calls } = fakeUmami({
      '/api/auth/login': login,
      '/api/websites/w1/stats': () => (++statsCalls === 1 ? json({}, 401) : json({ pageviews: 1, visitors: 1 })),
    });

    expect(await make(http).summary(SITE, WINDOW)).toEqual({ views: 1, visitors: 1 });
    expect(calls.filter(c => c.url.endsWith('/api/auth/login'))).toHaveLength(2);
  });

  it('caches a report for a minute', async () => {
    let now = 0;
    const { http, calls } = fakeUmami({
      '/api/auth/login': login,
      '/api/websites/w1/stats': () => json({ pageviews: 1, visitors: 1 }),
    });
    const umami = make(http, () => now);

    await umami.summary(SITE, WINDOW);
    await umami.summary(SITE, WINDOW);
    now = 61_000;
    await umami.summary(SITE, WINDOW);

    expect(calls.filter(c => c.url.includes('/stats'))).toHaveLength(2);
  });

  it('turns failures into ReadershipUnavailableError without leaking the payload', async () => {
    const { http } = fakeUmami({ '/api/send': () => json({}, 500) });
    const error = await make(http)
      .track(SITE, { path: '/article/x', title: 'X', ip: '203.0.113.9', userAgent: 'Secret UA' })
      .catch(e => e);

    expect(error).toBeInstanceOf(ReadershipUnavailableError);
    expect(String(error.message)).not.toContain('203.0.113.9');
    expect(String(error.message)).not.toContain('Secret UA');
  });

  it('sends the reader\'s user agent, not this server\'s', async () => {
    const { http, calls } = fakeUmami({ '/api/send': () => json({}) });
    await make(http).track(SITE, { path: '/article/x', title: 'X', userAgent: 'Reader UA' });

    const sent = calls[0]!;
    expect(sent.headers.get('user-agent')).toBe('Reader UA');
    expect(sent.headers.get('authorization')).toBeNull();
    const body = await sent.json() as { payload: Record<string, unknown> };
    expect(body.payload).toMatchObject({ website: 'w1', url: '/article/x', userAgent: 'Reader UA' });
  });
});

describe('backdating', () => {
  it('sends a timestamp only when the hit carries one', async () => {
    const { http, calls } = fakeUmami({ '/api/send': () => json({}) });
    const umami = make(http);
    await umami.track(SITE, { path: '/article/x', title: 'X' });
    await umami.track(SITE, { path: '/article/x', title: 'X', at: new Date('2026-09-01T00:00:00Z') });

    const [live, backdated] = await Promise.all(calls.map(c => c.json() as Promise<{ payload: Record<string, unknown> }>));
    expect(live!.payload).not.toHaveProperty('timestamp');
    expect(backdated!.payload.timestamp).toBe(1788220800);
  });
});

describe('DisabledReadershipAnalytics', () => {
  it('accepts tracking and reports reads as unavailable', async () => {
    const disabled = new DisabledReadershipAnalytics();
    await expect(disabled.track()).resolves.toBeUndefined();
    await expect(disabled.summary()).rejects.toBeInstanceOf(ReadershipUnavailableError);
  });
});
