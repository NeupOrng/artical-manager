import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Migrations run as an explicit deploy step — never automatically on API boot.
 * Two app containers starting concurrently must not race to migrate.
 * See docs/database-and-migrations.md.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  // max: 1 — the migrator must not run statements across multiple connections.
  const client = postgres(url, { max: 1, onnotice: () => {} });

  try {
    await migrate(drizzle(client), {
      migrationsFolder: `${__dirname}/migrations`,
    });
    console.log('migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('migration failed:', error);
  process.exit(1);
});
