import { pgTable, uuid, varchar, timestamp, unique } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Tenant-scoped taxonomy. Each tenant owns its own category set completely —
 * the technology and gaming sites share nothing here.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 80 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Scoped to tenant, NOT global. A global unique on slug would let one
    // tenant's taxonomy block another's. See docs/database-and-migrations.md.
    unique('categories_tenant_slug_key').on(t.tenantId, t.slug),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
