import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { tenants } from '../schema';

/**
 * Connects every tenant to readership analytics: one Umami website per tenant,
 * its id stored on `tenants.umami_website_id`.
 *
 * Like the super admin seed, this is a bootstrap step a real deployment runs,
 * not dev fixture content — so it refuses the published dev password in
 * production instead of refusing production outright, and it is idempotent: a
 * re-run repairs, never duplicates.
 *
 * Idempotency has a concrete failure mode behind it: if the website is created
 * in Umami and the process dies before the tenant row is updated, a re-run must
 * ADOPT that website (matched by domain) rather than create a second one.
 *
 * Also rotates Umami's first-boot password. Umami starts with admin / umami;
 * leaving that in place on a service that holds every tenant's traffic would be
 * a known credential, however internal the network.
 *
 * Verified against Umami 3.3.1 (the pinned image).
 */

/** Umami's own first-boot password. */
const UMAMI_FIRST_BOOT_PASSWORD = 'umami';

/** Shipped in .env.example — fine on a laptop, a known credential anywhere else. */
const DEV_DEFAULT_PASSWORD = 'artical-dev-umami-2026';

interface UmamiWebsite {
  id: string;
  name: string;
  domain: string | null;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) throw new Error(`${name} is not set`);
  return value;
};

class Umami {
  private token: string | null = null;

  constructor(private readonly base: string) {}

  /** Returns false on bad credentials; throws on anything else. */
  async login(username: string, password: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401) return false;
    if (!res.ok) throw new Error(`Umami login failed: ${res.status} ${await res.text()}`);
    this.token = ((await res.json()) as { token: string }).token;
    return true;
  }

  async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    if (!this.token) throw new Error('not logged in to Umami');
    const res = await fetch(`${this.base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) {
      throw new Error(`Umami ${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}

async function main(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  // Loopback-published in dev; on a VPS run this where umami:3000 resolves.
  const umamiUrl = (process.env.UMAMI_URL ?? 'http://localhost:3300').replace(/\/$/, '');
  const username = required('UMAMI_ADMIN_USERNAME').trim();
  const password = required('UMAMI_ADMIN_PASSWORD');

  if (password === UMAMI_FIRST_BOOT_PASSWORD) {
    throw new Error(
      'UMAMI_ADMIN_PASSWORD is Umami\'s own first-boot default. Set a different one — '
      + 'this task exists partly to replace it.',
    );
  }
  if (process.env.NODE_ENV === 'production' && password === DEV_DEFAULT_PASSWORD) {
    throw new Error(
      'UMAMI_ADMIN_PASSWORD is the published local-dev default. '
      + 'Set a real one before provisioning a production environment.',
    );
  }

  const heartbeat = await fetch(`${umamiUrl}/api/heartbeat`).catch(() => null);
  if (!heartbeat?.ok) {
    throw new Error(`Umami is not reachable at ${umamiUrl}. Is the stack up? Run \`task dev\`.`);
  }

  const umami = new Umami(umamiUrl);

  if (!(await umami.login(username, password))) {
    // Not the configured password — is this a fresh Umami still on its default?
    if (!(await umami.login(username, UMAMI_FIRST_BOOT_PASSWORD))) {
      throw new Error(
        'Umami rejected both UMAMI_ADMIN_PASSWORD and its first-boot default. '
        + 'If the password was changed by hand, set UMAMI_ADMIN_PASSWORD to it.',
      );
    }
    await umami.request('/api/me/password', {
      method: 'POST',
      body: { currentPassword: UMAMI_FIRST_BOOT_PASSWORD, newPassword: password },
    });
    if (!(await umami.login(username, password))) {
      throw new Error('Umami accepted the password change but not the new password.');
    }
    console.log('rotated the Umami admin password away from its first-boot default');
  }

  const { data: websites } = await umami.request<{ data: UmamiWebsite[] }>(
    '/api/websites?pageSize=500',
  );
  const byId = new Map(websites.map(w => [w.id, w]));
  const byDomain = new Map(websites.filter(w => w.domain).map(w => [w.domain!, w]));

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    const rows = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        domain: tenants.domain,
        umamiWebsiteId: tenants.umamiWebsiteId,
      })
      .from(tenants);

    for (const tenant of rows) {
      let website = tenant.umamiWebsiteId ? byId.get(tenant.umamiWebsiteId) : undefined;
      let action = 'kept';

      if (!website) {
        website = byDomain.get(tenant.domain);
        action = 'adopted';
      }
      if (!website) {
        website = await umami.request<UmamiWebsite>('/api/websites', {
          method: 'POST',
          body: { name: tenant.name, domain: tenant.domain },
        });
        action = 'created';
      }

      if (website.id !== tenant.umamiWebsiteId) {
        await db
          .update(tenants)
          .set({ umamiWebsiteId: website.id, updatedAt: new Date() })
          .where(eq(tenants.id, tenant.id));
      }

      console.log(`${action.padEnd(8)} ${tenant.name.padEnd(20)} → umami website ${website.id}`);
    }

    console.log('\nanalytics provisioned. Views recorded from now on reach Umami.');
  }
  finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('analytics provisioning failed:', error);
  process.exit(1);
});
