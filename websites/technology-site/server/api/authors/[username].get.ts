import type { AuthorProfile } from '~~/types/api'

/**
 * Proxies one author's public profile.
 *
 * Pages must not call the gateway directly — a page-level useFetch runs in the
 * browser on client-side navigation, which would ship the tenant key to every
 * reader. See server/utils/publicApi.ts.
 */
export default defineEventHandler(async (event): Promise<AuthorProfile> => {
  const username = getRouterParam(event, 'username')

  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Username is required' })
  }

  try {
    return await publicApi<AuthorProfile>(
      `/authors/${encodeURIComponent(username)}`,
    )
  }
  catch (error) {
    // A 404 from the API is a real 404 here: no such author, or another
    // tenant's. Anything else is our fault, not the reader's.
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 404) {
      throw createError({ statusCode: 404, statusMessage: 'Author not found' })
    }
    throw error
  }
})
