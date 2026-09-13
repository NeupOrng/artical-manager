import { pgTable, uuid, varchar, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { isNull } from 'drizzle-orm';
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

    /**
     * One or two sentences for the section page and its meta / og:description.
     * Null is a normal state — the sites fall back to a generic line — so it is
     * never required to create a category.
     */
    description: varchar('description', { length: 300 }),

    /**
     * Manual order in the tenant's navigation, ascending.
     *
     * Landed in three migrations, per the additive-first rule in
     * docs/database-and-migrations.md: added nullable (0009), backfilled by name
     * so no tenant's nav reshuffled (0010), then made NOT NULL (0011).
     *
     * No database default, deliberately. A default of 0 would let a caller forget
     * the column and silently file every new category at the top of the nav; the
     * repository always supplies the next free slot instead.
     */
    position: integer('position').notNull(),

    /**
     * Soft delete. A retired category keeps its rows so articles already filed
     * under it do not silently lose their section on pages that are already
     * published and cached.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Scoped to tenant, NOT global. A global unique on slug would let one
    // tenant's taxonomy block another's. See docs/database-and-migrations.md.
    //
    // PARTIAL, on live rows only. With soft delete a plain unique would keep a
    // retired category's slug reserved forever, so deleting `reviews` and
    // creating it again would fail with a constraint error the user cannot
    // explain or resolve.
    uniqueIndex('categories_tenant_slug_key')
      .on(t.tenantId, t.slug)
      .where(isNull(t.deletedAt)),
    index('categories_tenant_live_idx').on(t.tenantId, t.deletedAt),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
