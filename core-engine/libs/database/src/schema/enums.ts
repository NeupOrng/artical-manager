import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Two states only. Scheduled auto-publish was removed by decision — publishing
 * is immediate, so there is no future-dated state to represent.
 * See docs/article-status-lifecycle.md.
 */
export const articleStatus = pgEnum('article_status', ['draft', 'published']);

export const authorRole = pgEnum('author_role', [
  'admin',
  'editor',
  'contributor',
]);

export type ArticleStatus = (typeof articleStatus.enumValues)[number];
export type AuthorRole = (typeof authorRole.enumValues)[number];
