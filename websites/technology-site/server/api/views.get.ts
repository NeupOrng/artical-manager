import type { ViewTotals } from '~~/types/api'

/**
 * View totals for a batch of articles.
 *
 * Deliberately NOT cached here. Kong already caches public GETs for 60s, which
 * is the right amount of staleness for a view counter; adding a second cache on
 * top would make the number lag by minutes and read as broken to the reader who
 * just caused it.
 */
export default defineEventHandler(async (event): Promise<ViewTotals> => {
  const { articleIds } = getQuery(event)

  if (typeof articleIds !== 'string' || !articleIds.trim()) {
    // An empty request is a caller bug, not an empty result — the client only
    // calls this when it has ids.
    throw createError({ statusCode: 400, statusMessage: 'articleIds is required' })
  }

  const { totals } = await publicApi<{ totals: ViewTotals }>('/views', {
    articleIds,
  })

  return totals
})
