import type { ArticleDetail } from '~~/types/api'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  try {
    return await publicApi<ArticleDetail>(`/articles/${encodeURIComponent(slug)}`)
  } catch (error: unknown) {
    // The API returns 404 for "no such slug", "another tenant's article", and
    // "not published" alike — deliberately indistinguishable. Pass it through.
    const status = (error as { statusCode?: number }).statusCode
    if (status === 404) throw createError({ statusCode: 404, statusMessage: 'Article not found' })
    throw error
  }
})
