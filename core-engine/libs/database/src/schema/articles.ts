import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { articleStatus } from './enums';
import { tenants } from './tenants';
import { authors } from './authors';
import { categories } from './categories';

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => authors.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),

    title: varchar('title', { length: 300 }).notNull(),
    slug: varchar('slug', { length: 320 }).notNull(),
    /** TipTap block JSON — not HTML. The sites render from this. */
    content: jsonb('content').notNull().default({}),

    // excerpt and cover_image are MANDATORY to leave `draft` (they feed
    // og:description / og:image) but nullable here, because an article starts
    // as a draft before they exist. The Article aggregate enforces the
    // transition rule — see docs/article-status-lifecycle.md.
    excerpt: varchar('excerpt', { length: 500 }),
    coverImage: text('cover_image'),

    status: articleStatus('status').notNull().default('draft'),
    /** Set once, on first publish. Unpublish/republish does NOT reset it. */
    publishedAt: timestamp('published_at', { withTimezone: true }),

    // --- Reserved for Phase 2 (Facebook automation). Unused. Do not remove. ---
    hookText: text('hook_text'),
    fbPostId: varchar('fb_post_id', { length: 64 }),
    fbCommentId: varchar('fb_comment_id', { length: 64 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Slugs collide across tenants BY DESIGN — both sites may publish
    // /best-laptops-2026. A global unique here would be a correctness bug.
    unique('articles_tenant_slug_key').on(t.tenantId, t.slug),

    // Public listing: published articles, newest first.
    index('articles_tenant_status_published_idx').on(
      t.tenantId,
      t.status,
      t.publishedAt.desc(),
    ),
    // Category listing pages.
    index('articles_tenant_category_published_idx').on(
      t.tenantId,
      t.categoryId,
      t.publishedAt.desc(),
    ),
    index('articles_tenant_author_idx').on(t.tenantId, t.authorId),
  ],
);

export type ArticleRow = typeof articles.$inferSelect;
export type NewArticleRow = typeof articles.$inferInsert;
