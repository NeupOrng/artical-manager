import { pgTable, uuid, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';

/**
 * A platform operator — the person who creates tenants. Deliberately NOT a row
 * in `authors`, decided 2026-08-07.
 *
 * WHY A SEPARATE TABLE
 *
 * The obvious alternative is a `super_admin` role on `authors` with a nullable
 * `tenant_id`. That would be a mistake, and not a stylistic one:
 * `authors.tenant_id` being NOT NULL is what lets every repository method take a
 * required, non-optional `TenantId` and every query say
 * `eq(table.tenantId, tenantId)` without a null branch. Make it nullable and a
 * null can reach a WHERE clause, where `tenant_id = NULL` matches nothing — so
 * the failure is a super admin silently seeing an EMPTY list rather than an
 * error, which reads as "no articles yet" and is very hard to spot.
 *
 * Keeping platform admins out of the table means the tenant invariant in
 * docs/tenant-isolation.md stays literally true: an Author always has exactly
 * one tenant, no exceptions to remember.
 *
 * WHAT THIS IS NOT
 *
 * Not a super-user over tenant content. A platform admin resolves to a principal
 * with NO tenant, so tenant-scoped repositories cannot be called on their behalf
 * at all — there is no tenant id to pass. Reaching into a tenant's articles would
 * require a deliberate new code path with its own audit story, not an `if` in an
 * existing guard.
 *
 * See apps/api/src/common/guards/principal.guard.ts for how the two principal
 * kinds are resolved, and docs/auth-request-flow.md for the chain above it.
 */
export const platformAdmins = pgTable('platform_admins', {
  id: uuid('id').primaryKey(),

  /**
   * The Kratos identity this admin is resolved from, per request. Globally
   * unique across BOTH this table and `authors` in practice: one identity is one
   * person, and a person is either a platform operator or a tenant author.
   *
   * The database cannot express that constraint across two tables, so the
   * principal guard resolves `authors` first and treats a hit in both as a
   * misconfiguration rather than picking one.
   */
  kratosIdentityId: uuid('kratos_identity_id').notNull().unique(),

  /** Login identity handle, matching the Kratos `username` trait. */
  username: varchar('username', { length: 64 }).notNull().unique(),

  name: varchar('name', { length: 120 }).notNull(),

  /** Contact address. NOT a credential — same rule as authors.email. */
  email: varchar('email', { length: 254 }).notNull(),

  /**
   * Soft deactivation. Deleting the row would orphan the Kratos identity, which
   * could then still authenticate at the edge and get a confusing 403; flipping
   * this gives the API something explicit to refuse on.
   *
   * Checked on every request — the point of resolving the principal per request
   * rather than trusting a token claim is that this takes effect immediately.
   */
  isActive: boolean('is_active').notNull().default(true),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformAdminRow = typeof platformAdmins.$inferSelect;
export type NewPlatformAdminRow = typeof platformAdmins.$inferInsert;
