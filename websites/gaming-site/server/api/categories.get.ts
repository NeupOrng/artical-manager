import type { ArticleListItem, Paginated } from '~~/types/api'

/**
 * The tenant's categories, derived from published articles.
 *
 * There is no `/public/v1/categories` endpoint. Rather than invent one here or
 * hardcode a list — this project must not know which tenant it is, and
 * categories are tenant data managed through the admin — the nav derives from
 * the `categorySlug` already carried on every article.
 *
 * It is cached in Nitro deliberately. Without the cache this would be a second
 * API call on every article render, which is exactly the render-blocking
 * dependency on an ISR path that websites/CLAUDE.md warns about. With it, the
 * call happens once per TTL for the whole site, and an ISR revalidation is a
 * cache hit.
 *
 * The real fix is a `/public/v1/categories` endpoint returning name + slug +
 * ordering, at which point this handler collapses into a passthrough. Until
 * then a category with no published articles is invisible here.
 */
export default defineCachedEventHandler(
  async (): Promise<{ slug: string, count: number }[]> => {
    const page = await publicApi<Paginated<ArticleListItem>>('/articles', {
      perPage: 100,
    })

    const counts = new Map<string, number>()
    for (const article of page.data) {
      if (!article.categorySlug) continue
      counts.set(article.categorySlug, (counts.get(article.categorySlug) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => a.slug.localeCompare(b.slug))
  },
  {
    maxAge: 600,
    name: 'categories',
    getKey: () => 'all',
    // A backend blip must not take the nav down with it: serve the previous
    // value while revalidating, consistent with how the pages themselves fail.
    swr: true,
  },
)
