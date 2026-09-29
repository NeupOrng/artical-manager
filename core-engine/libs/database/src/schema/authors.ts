import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { authorRole } from './enums';
import { tenants } from './tenants';
import { media } from './media';

/**
 * An author belongs to exactly one tenant — cross-tenant authorship is out of
 * scope (root CLAUDE.md §2).
 *
 * No password column, ever. Kratos owns credentials; this table only holds the
 * reference. See docs/auth-request-flow.md.
 *
 * IDENTITY vs CONTACT — decided 2026-08-07, changed from the original design:
 *   - `username` is the identity handle, chosen by the author at registration.
 *     It is what appears in public URLs.
 *   - `email` is CONTACT INFORMATION ONLY. It is not a login identity and must
 *     not be treated as one. When Kratos lands it owns credentials and this
 *     column stays a publishable contact address.
 */
export const authors = pgTable(
  'authors',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),

    /** The identity this Author is resolved from, per request. Globally unique. */
    kratosIdentityId: uuid('kratos_identity_id').notNull().unique(),

    /**
     * Public identity handle. Nullable only because it was added to a populated
     * table — see the additive-first rule in docs/database-and-migrations.md.
     * Backfilled, then made NOT NULL in a follow-up migration.
     */
    username: varchar('username', { length: 64 }),

    name: varchar('name', { length: 120 }).notNull(),

    /** Contact address, publishable. NOT a login identity — see above. */
    email: varchar('email', { length: 254 }).notNull(),

    /** Short editorial line shown on the author's byline card. */
    quote: text('quote'),

    /**
     * Free text by explicit decision: may hold an @handle or a phone number, so
     * nothing downstream may assume a format or build a t.me link from it.
     */
    telegram: varchar('telegram', { length: 64 }),

    /**
     * Whether `email` and `telegram` may be shown publicly. Defaults to FALSE:
     * an author added later must not become publicly contactable because nobody
     * decided otherwise. The public DTO reads this, not the caller.
     */
    contactPublic: boolean('contact_public').notNull().default(false),

    role: authorRole('role').notNull().default('contributor'),

    /**
     * Set when an author is deactivated; null while they have access.
     *
     * A timestamp rather than a boolean: "when did this person lose access" is
     * the question asked afterwards, and a flag cannot answer it. Deactivation
     * is one of THREE layers — PrincipalGuard refuses this row on the next
     * request, the Kratos identity is set inactive so login is refused, and
     * their sessions are revoked. See docs/author-management.md.
     *
     * Never a delete: articles reference this row, and the byline is history.
     */
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),

    /**
     * Last authenticated request, written by PrincipalGuard at most once an
     * hour (it is on the hot path). Null means the invite was never accepted —
     * which is exactly how the Authors page tells "Invited" from "Active"
     * without asking Kratos whether a password exists.
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

    /**
     * Optional profile picture, referencing `media` rather than holding a bare
     * URL: that reuses the presign/confirm/derive pipeline, so an avatar gets
     * the same WebP renditions and the same tenant scoping as any other image.
     *
     * Nullable and expected to stay null for most authors — real authors arrive
     * via Kratos registration with nothing uploaded, so every surface must
     * render a fallback rather than a broken image.
     *
     * ON DELETE SET NULL: removing the media row must not remove the author.
     */
    avatarMediaId: uuid('avatar_media_id').references(() => media.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('authors_tenant_idx').on(t.tenantId),
    // Email is unique per tenant, not globally — two tenants may legitimately
    // have the same person as separate author records.
    index('authors_tenant_email_idx').on(t.tenantId, t.email),
    // Tenant-leading, never global: two tenants may legitimately have an author
    // called `editor`, exactly as slugs collide across tenants by design.
    unique('authors_tenant_username_key').on(t.tenantId, t.username),
  ],
);

export type AuthorRow = typeof authors.$inferSelect;
export type NewAuthorRow = typeof authors.$inferInsert;
