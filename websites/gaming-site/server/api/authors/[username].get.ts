import type { AuthorProfile } from '~~/types/api'

export default defineEventHandler(async (event) => {
  const username = getRouterParam(event, 'username')
  if (!username) throw createError({ statusCode: 400, statusMessage: 'Missing username' })

  try {
    return await publicApi<AuthorProfile>(`/authors/${encodeURIComponent(username)}`)
  } catch (error: unknown) {
    // Same deliberate ambiguity as articles: "no such author" and "another
    // tenant's author" are indistinguishable by design. Pass it through.
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Author not found' })
    throw error
  }
})
