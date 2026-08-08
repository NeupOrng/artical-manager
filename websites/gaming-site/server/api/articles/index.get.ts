import type { ArticleListItem, Paginated } from '~~/types/api'

export default defineEventHandler(async (event) => {
  const { page, perPage, categorySlug } = getQuery(event)

  return await publicApi<Paginated<ArticleListItem>>('/articles', {
    page: page ? Number(page) : undefined,
    perPage: perPage ? Number(perPage) : undefined,
    categorySlug: typeof categorySlug === 'string' ? categorySlug : undefined,
  })
})
