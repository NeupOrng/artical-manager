import type { PublicCategoryResolution } from '~~/types/api'

/**
 * What `/category/:slug` should render: the live section, a redirect to where a
 * renamed one lives now, or a 404.
 *
 * Cached like the nav list, and for the same reason: the page is ISR, but in the
 * window where it re-renders this should not be a second uncached API round
 * trip. A 404 is thrown, not returned, so Nitro does not cache it — a section
 * created a moment ago is not hidden behind a stale miss.
 */
export default defineCachedEventHandler(
  async (event) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

    try {
      return await publicApi<PublicCategoryResolution>(`/categories/${encodeURIComponent(slug)}`)
    }
    catch (error: unknown) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Section not found' })
      throw error
    }
  },
  {
    maxAge: 300,
    getKey: event => `category:${(getRouterParam(event, 'slug') ?? '').toLowerCase()}`,
  },
)
