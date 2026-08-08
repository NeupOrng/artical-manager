import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './libs/database/src/schema/index.ts',
  out: './libs/database/src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://artical:artical@localhost:5432/artical',
  },
  // Generated SQL is a DRAFT — read it before committing. Check for accidental
  // drops or table rewrites. See docs/database-and-migrations.md.
  verbose: true,
  strict: true,
});
