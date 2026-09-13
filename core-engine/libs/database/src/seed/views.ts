import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { articleViewCounts, articleViews, articles, tenants } from '../schema';
import { asTenantId } from '@core/shared';
// The adapter FILE, not the @core/article index: the index also exports the
// Nest-decorated repositories, which need Nest's runtime to even load.
import { UmamiReadershipAnalytics } from '@core/article/infrastructure/umami-readership.analytics';

/**
 * DEV ONLY: ninety days of believable readership, so the dashboard can be
 * designed and checked against something other than zeros.
 *
 * Views go through the SAME ingest path as live ones — the Umami adapter's
 * track(), backdated — and matching article_views rows are written so the two
 * stores agree. Deterministic: the same database produces the same traffic.
 *
 * Shape of the traffic, per published article: a spike on publish day decaying
 * over about a week, then a small steady tail (one article per site is
 * "evergreen" with a bigger tail). Plus home-page views, which count in site
 * totals but never in the article breakdowns. Referrers lean on Facebook, as the
 * product does. IPs are documentation ranges (TEST-NET), so there is no geo.
 *
 * Re-running refuses if views exist; `-- --reset` wipes article_views and
 * RECREATES each site's Umami website (new id, stored on the tenant). Not
 * Umami's own reset endpoint: that stamps the website with a reset time and
 * hides every event dated before it — which is all of a backfill. Found
 * 2026-09-13, when a reset made 1,678 seeded views read as zero.
 * Never runs against production.
 */

const DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 16;

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
];
const SCREENS = ['1440x900', '1920x1080', '390x844', '412x915', '1536x864'];
const LANGUAGES = ['en-US', 'en-GB', 'km-KH', 'en-US', 'fr-FR'];

/** [referrer, weight]. '' is direct / internal. */
const REFERRERS: [string, number][] = [
  ['https://l.facebook.com/', 22],
  ['https://m.facebook.com/', 16],
  ['https://www.facebook.com/', 6],
  ['', 30],
  ['https://www.google.com/', 16],
  ['https://t.co/', 5],
  ['https://news.ycombinator.com/', 3],
  ['https://www.reddit.com/', 2],
];

/** mulberry32 — tiny, seedable, good enough for fake traffic. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

function weighted<T>(rand: () => number, items: [T, number][]): T {
  const total = items.reduce((t, [, w]) => t + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    if ((r -= w) < 0) return item;
  }
  return items[items.length - 1]![0];
}

interface Hit {
  articleId: string | null;
  path: string;
  title: string;
  at: Date;
  referrer: string;
  visitor: number;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

/** Deletes the site's Umami website (and with it every event) and creates a fresh one. */
async function recreateUmamiWebsite(
  url: string,
  username: string,
  password: string,
  site: { name: string, domain: string, websiteId: string },
): Promise<string> {
  const login = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`Umami login failed: ${login.status}`);
  const { token } = (await login.json()) as { token: string };
  const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const removed = await fetch(`${url}/api/websites/${site.websiteId}`, { method: 'DELETE', headers: auth });
  if (!removed.ok) throw new Error(`Umami delete of ${site.websiteId} failed: ${removed.status}`);

  const created = await fetch(`${url}/api/websites`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ name: site.name, domain: site.domain }),
  });
  if (!created.ok) throw new Error(`Umami website creation failed: ${created.status}`);
  return ((await created.json()) as { id: string }).id;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:seed:views writes synthetic traffic and refuses to run in production.');
  }
  const reset = process.argv.includes('--reset');
  const umamiUrl = (process.env.UMAMI_URL ?? 'http://localhost:3300').replace(/\/$/, '');
  const username = required('UMAMI_ADMIN_USERNAME');
  const password = required('UMAMI_ADMIN_PASSWORD');

  const client = postgres(required('DATABASE_URL'), { max: 4, onnotice: () => {} });
  const db = drizzle(client);
  const umami = new UmamiReadershipAnalytics({ url: umamiUrl, username, password });

  try {
    const sites = await db
      .select({ id: tenants.id, name: tenants.name, domain: tenants.domain, websiteId: tenants.umamiWebsiteId })
      .from(tenants)
      .where(isNotNull(tenants.umamiWebsiteId));

    if (sites.length === 0) {
      throw new Error('No tenant has an Umami website. Run `task analytics:provision` first.');
    }
    const tenantIds = sites.map(s => s.id);

    const [existing] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(articleViews)
      .where(inArray(articleViews.tenantId, tenantIds));
    if ((existing?.n ?? 0) > 0 && !reset) {
      throw new Error(
        `${existing!.n} views already recorded. Re-run with \`task db:seed:views -- --reset\` to `
        + 'replace them — that wipes article_views AND the Umami data for these sites.',
      );
    }
    if (reset) {
      await db.delete(articleViews).where(inArray(articleViews.tenantId, tenantIds));
      await db.delete(articleViewCounts).where(inArray(articleViewCounts.tenantId, tenantIds));
      for (const s of sites) {
        s.websiteId = await recreateUmamiWebsite(umamiUrl, username, password, {
          name: s.name,
          domain: s.domain,
          websiteId: s.websiteId!,
        });
        await db.update(tenants).set({ umamiWebsiteId: s.websiteId, updatedAt: new Date() }).where(eq(tenants.id, s.id));
      }
      console.log('reset: cleared article_views and recreated each site\'s Umami website');
    }

    const now = Date.now();
    const windowStart = now - DAYS * DAY_MS;

    for (const site of sites) {
      const rand = rng(hash(site.id));
      const published = await db
        .select({ id: articles.id, slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt })
        .from(articles)
        .where(and(eq(articles.tenantId, site.id), eq(articles.status, 'published')));

      const hits: Hit[] = [];
      const evergreen = published[Math.floor(rand() * published.length)]?.id;

      const push = (articleId: string | null, path: string, title: string, dayStart: number, earliest: number) => {
        const from = Math.max(dayStart, earliest);
        const to = Math.min(dayStart + DAY_MS, now);
        if (to <= from) return;
        hits.push({
          articleId,
          path,
          title,
          at: new Date(from + rand() * (to - from)),
          referrer: weighted(rand, REFERRERS),
          visitor: Math.floor(rand() * 600),
        });
      };

      for (const a of published) {
        const publishedAt = (a.publishedAt ?? new Date(windowStart)).getTime();
        const peak = 30 + rand() * 45;
        const tail = a.id === evergreen ? 7 + rand() * 4 : 1 + rand() * 3;
        for (let day = Math.floor(windowStart / DAY_MS) * DAY_MS; day < now; day += DAY_MS) {
          if (day + DAY_MS <= publishedAt) continue;
          const sincePublish = Math.floor((day - Math.floor(publishedAt / DAY_MS) * DAY_MS) / DAY_MS);
          const spike = sincePublish >= 0 && sincePublish < 7 ? peak * 0.55 ** sincePublish : 0;
          const expected = (tail + spike) * (0.6 + rand() * 0.8);
          for (let i = 0; i < Math.round(expected); i++) push(a.id, `/article/${a.slug}`, a.title, day, publishedAt);
        }
      }
      // Home page: counts in site totals, never in article breakdowns.
      for (let day = Math.floor(windowStart / DAY_MS) * DAY_MS; day < now; day += DAY_MS) {
        const n = Math.round(4 + rand() * 8);
        for (let i = 0; i < n; i++) push(null, '/', site.name, day, windowStart);
      }

      // Send through the real adapter, a few at a time.
      const readershipSite = { tenantId: asTenantId(site.id), websiteId: site.websiteId!, hostname: site.domain };
      let failed = 0;
      for (let i = 0; i < hits.length; i += CONCURRENCY) {
        await Promise.all(hits.slice(i, i + CONCURRENCY).map(async (h) => {
          const ua = USER_AGENTS[h.visitor % USER_AGENTS.length]!;
          try {
            await umami.track(readershipSite, {
              path: h.path,
              title: h.title,
              referrer: h.referrer || null,
              language: LANGUAGES[h.visitor % LANGUAGES.length],
              screen: SCREENS[(h.visitor + (ua.includes('Mobile') ? 2 : 0)) % SCREENS.length],
              // Documentation ranges only — no real person's address, no geo.
              ip: `${h.visitor % 2 ? '198.51.100' : '203.0.113'}.${(h.visitor % 254) + 1}`,
              userAgent: ua,
              at: h.at,
            });
          }
          catch {
            failed += 1;
          }
        }));
      }
      if (failed > hits.length * 0.01) {
        throw new Error(`${failed} of ${hits.length} views were refused by Umami for ${site.name}.`);
      }

      // The authoritative log gets the article views (not the home page), and
      // the running totals are rebuilt from it so they cannot disagree.
      const articleHits = hits.filter(h => h.articleId);
      for (let i = 0; i < articleHits.length; i += 1000) {
        await db.insert(articleViews).values(
          articleHits.slice(i, i + 1000).map(h => ({
            id: uuidv7(),
            tenantId: site.id,
            articleId: h.articleId!,
            occurredAt: h.at,
          })),
        );
      }
      const totals = new Map<string, number>();
      for (const h of articleHits) totals.set(h.articleId!, (totals.get(h.articleId!) ?? 0) + 1);
      if (totals.size) {
        await db
          .insert(articleViewCounts)
          .values([...totals].map(([articleId, total]) => ({ tenantId: site.id, articleId, total })))
          .onConflictDoUpdate({
            target: [articleViewCounts.tenantId, articleViewCounts.articleId],
            set: { total: sql.raw('excluded.total'), updatedAt: new Date() },
          });
      }

      console.log(
        `${site.name.padEnd(18)} ${String(hits.length).padStart(6)} views over ${DAYS} days `
        + `(${articleHits.length} on ${published.length} articles, ${hits.length - articleHits.length} home)`
        + (failed ? `, ${failed} refused` : ''),
      );
    }

    console.log('\nreadership seeded. The dashboard caches Umami reports for 60 s.');
  }
  finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('view seed failed:', error);
  process.exit(1);
});
