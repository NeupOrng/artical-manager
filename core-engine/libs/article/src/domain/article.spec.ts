import { describe, it, expect } from 'vitest';
import { Article, type ArticleProps } from './article';
import {
  EmptyTitleError,
  MissingCoverImageError,
  MissingExcerptError,
  SlugLockedError,
  UnsluggableTitleError,
} from './errors';
import { asArticleId, asAuthorId, asTenantId } from '@core/shared';

// No mocks anywhere in this file. That is the payoff for keeping domain/ pure —
// if a test here needed a mock, the layering would have slipped.
const NOW = new Date('2026-08-06T10:00:00Z');
const YESTERDAY = new Date('2026-08-05T10:00:00Z');

function anArticle(overrides: Partial<ArticleProps> = {}): Article {
  return Article.fromProps({
    id: asArticleId('018f-article'),
    tenantId: asTenantId('018f-tenant'),
    authorId: asAuthorId('018f-author'),
    categoryId: null,
    title: 'Title',
    slug: 'title',
    content: {},
    excerpt: 'An excerpt.',
    coverImage: 'https://media.example.com/cover.jpg',
    status: 'draft',
    publishedAt: null,
    ...overrides,
  });
}

describe('Article invariants', () => {
  it('refuses to publish without an excerpt', () => {
    expect(() => anArticle({ excerpt: null }).publish(NOW)).toThrow(MissingExcerptError);
  });

  it('refuses to publish without a cover image', () => {
    expect(() => anArticle({ coverImage: null }).publish(NOW)).toThrow(
      MissingCoverImageError,
    );
  });
});

describe('Article transitions', () => {
  it('publishes immediately', () => {
    const article = anArticle();
    article.publish(NOW);

    expect(article.status).toBe('published');
    expect(article.publishedAt).toEqual(NOW);
  });

  it('publishing is idempotent and does not move publishedAt', () => {
    const article = anArticle();
    article.publish(NOW);
    const first = article.publishedAt;

    // A double click or a retried request must not produce a second date.
    article.publish(new Date('2026-09-01T00:00:00Z'));

    expect(article.publishedAt).toEqual(first);
  });

  it('republishing keeps the original publication date', () => {
    const article = anArticle({ status: 'published', publishedAt: YESTERDAY });
    article.unpublish();
    expect(article.status).toBe('draft');

    article.publish(NOW);

    // publishedAt is canonical — it feeds article:published_time and sort order.
    expect(article.publishedAt).toEqual(YESTERDAY);
  });

  it('unpublish is idempotent on a draft', () => {
    const article = anArticle();
    expect(() => article.unpublish()).not.toThrow();
    expect(article.status).toBe('draft');
  });
});

describe('Article.createDraft', () => {
  const base = {
    id: asArticleId('018f-new'),
    tenantId: asTenantId('018f-tenant'),
    authorId: asAuthorId('018f-author'),
  };

  it('always starts as a draft', () => {
    // There is no path that creates something already public. That is what
    // keeps publishing a deliberate act rather than a convention.
    const article = Article.createDraft({ ...base, title: 'Hello world' });

    expect(article.status).toBe('draft');
    expect(article.publishedAt).toBeNull();
  });

  it('derives a slug from the title', () => {
    const article = Article.createDraft({
      ...base,
      title: '  The Repairable Phone Is Back!  ',
    });

    expect(article.slug).toBe('the-repairable-phone-is-back');
    expect(article.title).toBe('The Repairable Phone Is Back!');
  });

  it('strips diacritics rather than dropping the word', () => {
    const article = Article.createDraft({ ...base, title: 'Café culture' });
    expect(article.slug).toBe('cafe-culture');
  });

  it('prefers an explicit slug, still normalised', () => {
    const article = Article.createDraft({
      ...base,
      title: 'Anything',
      slug: 'My Custom Slug',
    });
    expect(article.slug).toBe('my-custom-slug');
  });

  it('refuses an empty title', () => {
    expect(() => Article.createDraft({ ...base, title: '   ' })).toThrow(
      EmptyTitleError,
    );
  });

  it('refuses a title that cannot become a URL', () => {
    // Punctuation-only slugifies to an empty string. Silently generating
    // `article-1` would hide that from the author.
    expect(() => Article.createDraft({ ...base, title: '!!! ???' })).toThrow(
      UnsluggableTitleError,
    );
  });

  it('starts with no excerpt or cover, and says what publishing needs', () => {
    const article = Article.createDraft({ ...base, title: 'Draft' });
    expect(article.missingToPublish()).toEqual(['excerpt', 'coverImage']);
  });
});

describe('Article.edit', () => {
  it('collapses an empty excerpt to null so "cleared" is one state', () => {
    const article = anArticle();
    article.edit({ excerpt: '   ' });

    // publish() only has to check falsiness, not both '' and null.
    expect(article.toProps().excerpt).toBeNull();
    expect(article.missingToPublish()).toContain('excerpt');
  });

  it('leaves omitted fields untouched — PATCH semantics', () => {
    const article = anArticle({ title: 'Original', excerpt: 'Keep me' });
    article.edit({ title: 'Changed' });

    expect(article.title).toBe('Changed');
    expect(article.toProps().excerpt).toBe('Keep me');
  });

  it('refuses an empty title', () => {
    expect(() => anArticle().edit({ title: '  ' })).toThrow(EmptyTitleError);
  });

  it('allows a slug change while still a draft', () => {
    const article = anArticle({ status: 'draft' });
    article.edit({ slug: 'A New Slug' });
    expect(article.slug).toBe('a-new-slug');
  });

  it('REFUSES a slug change once published', () => {
    // The slug is a live public URL: already shared, indexed, and cached in ISR
    // pages that only revalidate on publish. Changing it breaks all of those
    // silently, so the aggregate is where it gets stopped.
    const article = anArticle({ status: 'published', publishedAt: YESTERDAY });

    expect(() => article.edit({ slug: 'something-else' })).toThrow(SlugLockedError);
    expect(article.slug).toBe('title');
  });

  it('cannot change status — that is what the transitions are for', () => {
    const article = anArticle({ status: 'draft' });
    // @ts-expect-error status is deliberately not part of the edit surface
    article.edit({ status: 'published' });

    expect(article.status).toBe('draft');
  });
});

describe('missingToPublish', () => {
  it('is empty when the article is ready', () => {
    expect(anArticle().missingToPublish()).toEqual([]);
  });

  it('agrees with what publish() actually enforces', () => {
    // The hint and the enforcement read the same fields. If they ever diverge,
    // the UI promises something the API refuses.
    const article = anArticle({ excerpt: null, coverImage: null });

    expect(article.missingToPublish()).toEqual(['excerpt', 'coverImage']);
    expect(() => article.publish(NOW)).toThrow(MissingExcerptError);
  });
});
