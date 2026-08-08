import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { v7 as uuidv7 } from 'uuid';
import { platformAdmins } from '../schema';

/**
 * Creates the platform super admin: a Kratos identity plus the `platform_admins`
 * row that makes it a recognised principal. Both are required — one without the
 * other is an account that can log in but gets a 403, or a database row nobody
 * can authenticate as.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Self-service registration is disabled in Kratos (see
 * infrastructure/ory/kratos/README.md), because an identity with no matching row
 * is a 403 by design — a public signup path could only ever manufacture accounts
 * that cannot log in. So the first account has to be created through the ADMIN
 * api, which is exactly what this does.
 *
 * SEPARATE FROM `seed/index.ts` ON PURPOSE
 *
 * That one is dev fixture content and refuses to run against production. This is
 * a bootstrap step that a real deployment legitimately needs to run exactly once,
 * so it carries no such refusal — instead it insists on a strong password and is
 * idempotent, so a second run repairs rather than duplicates.
 *
 * Idempotency has a real failure mode behind it: if the Kratos identity is
 * created and the process dies before the database insert, a re-run must adopt
 * the existing identity rather than fail forever on a 409. That is why the
 * conflict path looks the identity up instead of giving up.
 */

interface KratosIdentity {
  id: string;
  traits: { username: string; email: string; name: string };
}

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is not set`);
  }
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
    throw new Error(
      `Kratos identity lookup failed: ${res.status} ${await res.text()}`,
    );
  }

  const found = (await res.json()) as KratosIdentity[];
  return found[0] ?? null;
}

async function ensureKratosIdentity(
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
      credentials: {
        password: { config: { password } },
      },
      // Contact address, pre-verified: this account is created by whoever
      // controls the deployment, so there is nobody to send a confirmation to
      // and no verification loop worth making them complete.
      verifiable_addresses: [
        { value: traits.email, via: 'email', verified: true, status: 'completed' },
      ],
    }),
  });

  if (res.ok) {
    return { identity: (await res.json()) as KratosIdentity, created: true };
  }

  // 409: the identity already exists. Adopt it rather than fail — see the note
  // on partial-failure recovery above.
  if (res.status === 409) {
    const existing = await findIdentityByUsername(adminUrl, traits.username);
    if (!existing) {
      throw new Error(
        `Kratos reported username "${traits.username}" as taken, but no identity `
        + 'matched the lookup. The username may belong to an identity using a '
        + 'different credential type.',
      );
    }
    return { identity: existing, created: false };
  }

  // 400 here is nearly always the password: Kratos enforces a 12-character
  // minimum and checks HaveIBeenPwned, so a weak one is rejected at this step.
  throw new Error(
    `Kratos identity creation failed: ${res.status} ${await res.text()}`,
  );
}

async function main(): Promise<void> {
  const databaseUrl = required('DATABASE_URL');
  // Kratos' ADMIN api — never the public one. It is loopback-published locally
  // and must never be routable from outside; anything that can reach it can
  // create identities and impersonate anyone.
  const kratosAdminUrl = (
    process.env.KRATOS_ADMIN_URL ?? 'http://localhost:4434'
  ).replace(/\/$/, '');

  const traits = {
    username: required('SUPER_ADMIN_USERNAME').trim().toLowerCase(),
    email: required('SUPER_ADMIN_EMAIL').trim(),
    name: required('SUPER_ADMIN_NAME').trim(),
  };
  const password = required('SUPER_ADMIN_PASSWORD');

  if (password === 'replace-me-at-least-12-chars') {
    throw new Error(
      'SUPER_ADMIN_PASSWORD is still the placeholder from .env.example. Set a real one.',
    );
  }

  const { identity, created } = await ensureKratosIdentity(
    kratosAdminUrl,
    traits,
    password,
  );
  console.log(
    created
      ? `created Kratos identity ${identity.id}`
      : `reusing existing Kratos identity ${identity.id}`,
  );

  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    // Keyed on kratos_identity_id, not username: the identity is the durable
    // link between the two systems. Someone renaming the username in Kratos must
    // not cause this to insert a second row for the same person.
    const [existing] = await db
      .select({ id: platformAdmins.id })
      .from(platformAdmins)
      .where(eq(platformAdmins.kratosIdentityId, identity.id))
      .limit(1);

    if (existing) {
      await db
        .update(platformAdmins)
        .set({
          username: traits.username,
          name: traits.name,
          email: traits.email,
          // Re-running this is the documented way to recover an account that
          // was deactivated by mistake.
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(platformAdmins.id, existing.id));

      console.log(`updated platform_admins row ${existing.id}`);
    }
    else {
      const id = uuidv7();
      await db.insert(platformAdmins).values({
        id,
        kratosIdentityId: identity.id,
        username: traits.username,
        name: traits.name,
        email: traits.email,
      });

      console.log(`created platform_admins row ${id}`);
    }

    console.log(`\nsuper admin ready — log in as "${traits.username}"`);
  }
  finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('super admin seed failed:', error);
  process.exit(1);
});
