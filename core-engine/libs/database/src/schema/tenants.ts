import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { isNotNull } from 'drizzle-orm';

/**
 * The only table without a tenant_id — it *is* the tenant.
 *
 * Adding a tenant is a row here plus a domain, a site project, and authors.
 */
export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Custom domain, one per tenant. Globally unique. */
    domain: varchar('domain', { length: 253 }).notNull().unique(),
    nicheLabel: varchar('niche_label', { length: 60 }).notNull(),

    /**
     * This tenant's website in Umami (readership analytics). Set by
     * `task analytics:provision`, never by a request.
     *
     * Nullable PERMANENTLY, not as a first step toward NOT NULL: null means
     * "analytics not provisioned", a normal state the dashboard renders as
     * not-connected. A new tenant works fully before anyone provisions it.
     *
     * It is the tenant boundary inside Umami. The API reads it from the
     * caller's own tenant row and passes it to the adapter; nothing ever takes
     * a website id from input. See docs/proposals/dashboard-analytics-umami.md.
     */
    umamiWebsiteId: uuid('umami_website_id'),

    // --- Reserved for Phase 2 (Facebook automation). Unused. Do not remove. ---
    // See root CLAUDE.md §2 — these exist so enabling automation later is
    // additive rather than a migration against live data.
    fbPageId: varchar('fb_page_id', { length: 64 }),
    /** MUST be encrypted at rest once it starts being written. Never plaintext. */
    fbPageAccessToken: text('fb_page_access_token'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Two tenants sharing one Umami website would merge their readership —
    // one site's editors reading the other's traffic. Partial, so any number of
    // tenants may be unprovisioned (null) at once.
    uniqueIndex('tenants_umami_website_key')
      .on(t.umamiWebsiteId)
      .where(isNotNull(t.umamiWebsiteId)),
  ],
);

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
