import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { authors } from '../schema';

/**
 * Gives the seeded authors real Kratos identities so someone can actually log in
 * as one and see the author dashboard.
 *
 * WHY THIS IS SEPARATE FROM `seed/index.ts`
 *
 * That script is pure Postgres and runs against `task up:infra` (datastores
 * only, no Kratos). Folding identity creation into it would couple the content
 * seed to a service it otherwise does not need, and break that workflow for
 * everyone who only wanted fixture articles.
 *
 * WHY THE SEED LEAVES A PLACEHOLDER IN THE FIRST PLACE
 *
 * `seed/index.ts` writes a random uuid into `kratos_identity_id` because the
 * column is NOT NULL and globally unique, and it has no Kratos to ask. The row
 * is therefore valid but unreachable: nothing can authenticate as it. This
 * script replaces that placeholder with a real identity id.
 *
 * DEV ONLY. It sets a shared, known password for every seeded author.
 */

interface KratosIdentity {
  id: string;
  traits: { username: string; email: string; name: string };
}

/**
 * Matches the authors created by `seed/index.ts` — keep in sync with the
 * TENANTS array there. Two entries, one per tenant, and the usernames are what
 * you log in with.
 */
const SEEDED_USERNAMES = ['mara-okonkwo', 'devin-hartley'];

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) throw new Error(`${name} is not set`);
  return value;
};

async function findIdentityByUsername(
  adminUrl: string,
  username: string,
): Promise<KratosIdentity | null> {
  const res = await fetch(
    `${adminUrl}/admin/identities?credentials_identifier=${encodeURIComponent(username)}`,
  );
  if (!res.ok) {
    throw new Error(`Kratos lookup failed: ${res.status} ${await res.text()}`);
  }
  const found = (await res.json()) as KratosIdentity[];
  return found[0] ?? null;
}

async function ensureIdentity(
  adminUrl: string,
  traits: KratosIdentity['traits'],
  password: string,
): Promise<{ identity: KratosIdentity; created: boolean }> {
  const res = await fetch(`${adminUrl}/admin/identities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema_id: 'author',
      traits,
      credentials: { password: { config: { password } } },
      verifiable_addresses: [
        { value: traits.email, via: 'email', verified: true, status: 'completed' },
      ],
    }),
  });

  if (res.ok) {
    return { identity: (await res.json()) as KratosIdentity, created: true };
  }

  // Already exists — adopt it. Same partial-failure recovery as the platform
  // admin seed: the identity may have been created on a previous run that died
  // before the database update.
  if (res.status === 409) {
    const existing = await findIdentityByUsername(adminUrl, traits.username);
    if (!existing) {
      throw new Error(
        `Kratos says "${traits.username}" is taken but no identity matched.`,
      );
    }
    return { identity: existing, created: false };
  }

  throw new Error(`Kratos identity creation failed: ${res.status} ${await res.text()}`);
}

async function main(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');

  if (process.env.NODE_ENV === 'production') {
    // Unlike the platform-admin seed, this one has no legitimate production
    // use: it exists to make FIXTURE authors loggable, with a shared password.
    console.error('refusing to run against production');
    process.exit(1);
  }

  const kratosAdminUrl = (
    process.env.KRATOS_ADMIN_URL ?? 'http://localhost:4434'
  ).replace(/\/$/, '');
  const password = process.env.SEED_AUTHOR_PASSWORD ?? 'seed-author-password-2026';

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    for (const username of SEEDED_USERNAMES) {
      // Scoped by username alone deliberately: this is a dev script and the
      // seed creates exactly one author per tenant with distinct usernames. It
      // is NOT a pattern to copy into application code, where the constraint is
      // (tenant_id, username) and a username-only lookup finds the wrong row.
      const [row] = await db
        .select({
          id: authors.id,
          name: authors.name,
          email: authors.email,
          tenantId: authors.tenantId,
        })
        .from(authors)
        .where(eq(authors.username, username))
        .limit(1);

      if (!row) {
        console.log(`skipping ${username} — no seeded author row (run task db:seed first)`);
        continue;
      }

      const { identity, created } = await ensureIdentity(
        kratosAdminUrl,
        { username, email: row.email, name: row.name },
        password,
      );

      await db
        .update(authors)
        .set({ kratosIdentityId: identity.id, updatedAt: new Date() })
        .where(eq(authors.id, row.id));

      console.log(
        `${created ? 'created' : 'reused'} identity for ${username} → ${identity.id}`,
      );
    }

    console.log(`\nseeded authors can now log in. password: ${password}`);
    console.log('usernames: ' + SEEDED_USERNAMES.join(', '));
  }
  finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('author identity seed failed:', error);
  process.exit(1);
});
