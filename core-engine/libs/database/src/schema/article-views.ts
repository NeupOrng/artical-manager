import {
  pgTable,
  uuid,
  bigint,
  timestamp,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { articles } from './articles';

/**
 * Article readership.
 *
 * TWO TABLES ON PURPOSE, and neither of them is a column on `articles`:
 *
 *  - `article_views` is the append-only event log. It is the part that CANNOT
 *    be reconstructed later (root CLAUDE.md §9), so it is recorded from day one
 *    even though nothing reads it yet. Every future question — "popular this
 *    month", per-day charts, referrer breakdowns — is answerable from these
 *    rows and from nothing else.
 *
 *  - `article_view_counts` is the running total the public site displays. One
 *    row per article, so rendering a count is a point lookup rather than an
 *    aggregate over the event log.
 *
 * Why not `articles.view_count`: the Article aggregate owns editorial state and
 * enforces transitions on it. A counter incremented by anonymous readers is not
 * editorial state, and putting it on that row would mean every view either
 * loaded and saved an aggregate or quietly bypassed it. Keeping it in its own
 * table means the aggregate never has to know this feature exists.
 */
export const articleViews = pgTable(
  'article_views',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),

    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The rollup/analysis access path: one article's events over a window.
    index('article_views_tenant_article_time_idx').on(
      t.tenantId,
      t.articleId,
      t.occurredAt.desc(),
    ),
    // Retention sweeps delete by age across all tenants, so this one is
    // deliberately not tenant-leading — it is the only query that is not.
    index('article_views_occurred_idx').on(t.occurredAt),
  ],
);

/**
 * The displayed total. Upserted on write rather than rebuilt by a poller,
 * because the number is shown to the reader who just caused it: a count that
 * lags a polling interval reads as broken ("I opened it, why is it still 41?").
 *
 * Rebuildable from `article_views` at any time, which is what makes it safe to
 * treat as a cache rather than as truth.
 */
export const articleViewCounts = pgTable(
  'article_view_counts',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),

    /** bigint: an integer column is a ceiling nobody wants to migrate past. */
    total: bigint('total', { mode: 'number' }).notNull().default(0),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Tenant-leading, like every other key here. The article id alone would be
    // unique in practice, but the composite is what makes an unscoped lookup a
    // compile-time impossibility rather than a convention.
    primaryKey({
      name: 'article_view_counts_pkey',
      columns: [t.tenantId, t.articleId],
    }),
  ],
);

export type ArticleViewRow = typeof articleViews.$inferSelect;
export type ArticleViewCountRow = typeof articleViewCounts.$inferSelect;
