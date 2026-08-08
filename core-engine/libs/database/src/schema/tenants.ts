import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The only table without a tenant_id — it *is* the tenant.
 *
 * Adding a tenant is a row here plus a domain, a site project, and authors.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Custom domain, one per tenant. Globally unique. */
  domain: varchar('domain', { length: 253 }).notNull().unique(),
  nicheLabel: varchar('niche_label', { length: 60 }).notNull(),

  // --- Reserved for Phase 2 (Facebook automation). Unused. Do not remove. ---
  // See root CLAUDE.md §2 — these exist so enabling automation later is
  // additive rather than a migration against live data.
  fbPageId: varchar('fb_page_id', { length: 64 }),
  /** MUST be encrypted at rest once it starts being written. Never plaintext. */
  fbPageAccessToken: text('fb_page_access_token'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
