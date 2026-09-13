/**
 * The one place that knows how an article appears in readership data.
 *
 * Views are sent to analytics under the article's public URL path, and the
 * dashboard maps paths back to articles. Both directions live here so they
 * cannot drift: `/article/:slug` is the sites' route (websites/*), and a path
 * this module does not recognise is simply not an article view.
 */

const ARTICLE_PATH = /^\/article\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/** The path a view of this article is recorded under. */
export function articlePath(slug: string): string {
  return `/article/${slug}`;
}

/** The slug in an article path, or null for anything else (home, categories, junk). */
export function slugFromPath(path: string): string | null {
  return ARTICLE_PATH.exec(path)?.[1] ?? null;
}
