import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { categories } from './categories';

/**
 * Slugs a category used to have, so an old `/category/:slug` link redirects to
 * where the section lives now instead of rendering an empty page.
 *
 * WHY IT POINTS AT A CATEGORY, NOT AT A SLUG
 *
 * Storing `old_slug → category_id` rather than `old_slug → new_slug` means a
 * category renamed twice (a → b → c) needs no chain-following: both `a` and `b`
 * resolve to the category, whose *current* slug is `c`. A slug-to-slug table
 * would need a chain walk, and a cycle (a → b → a) would loop.
 *
 * TENANT-LEADING, because slugs collide across tenants by design — both sites
 * may once have had a `reviews`. A global unique on `old_slug` would let one
 * tenant's rename block another's.
 *
 * A live category always beats a redirect for the same slug: when a slug is
 * claimed by a live category (create, rename-to, restore), its redirect row is
 * removed in the same operation. Resolution checks the live category first
 * anyway, so a stale row could never shadow one — removing it just keeps the
 * table honest.
 *
 * The FK on category_id carries no tenant predicate, exactly like
 * articles.category_id. Rows are only ever written from a tenant-scoped
 * category that was just loaded, and every read filters on BOTH this table's
 * tenant_id and the joined category's.
 */
export const categorySlugRedirects = pgTable(
  'category_slug_redirects',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    oldSlug: varchar('old_slug', { length: 120 }).notNull(),

    categoryId: uuid('category_id')
      .notNull()
      // Categories are soft-deleted in the app and never hard-deleted, so this
      // cascade only fires if a tenant is removed — which cascades anyway.
      .references(() => categories.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('category_slug_redirects_tenant_slug_key').on(t.tenantId, t.oldSlug),
  ],
);

export type CategorySlugRedirectRow = typeof categorySlugRedirects.$inferSelect;
export type NewCategorySlugRedirectRow = typeof categorySlugRedirects.$inferInsert;
