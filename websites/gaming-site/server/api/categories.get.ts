import type { PublicCategory } from '~~/types/api'

/**
 * The tenant's categories, from the API.
 *
 * Previously derived from the `categorySlug` on published articles, because no
 * `/public/v1/categories` endpoint existed. That workaround could only ever
 * surface sections that already had something published in them, so a newly
 * created category stayed invisible until an article was filed in it — and a
 * renamed one kept its old label until every article was re-fetched.
 *
 * Still cached in Nitro: nav renders on every page, and an uncached call here
 * would be a second API round trip on every article render — exactly the
 * render-blocking pattern the ISR contract forbids.
 */
export default defineCachedEventHandler(
  async () => {
    const { data } = await publicApi<{ data: PublicCategory[] }>('/categories')
    return data
  },
  {
    maxAge: 300,
    // Keyless: the response is identical for every reader of this tenant, and
    // the tenant is fixed per deployment.
    getKey: () => 'categories',
  },
)
