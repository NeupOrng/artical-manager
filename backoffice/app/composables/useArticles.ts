import type { ArticleDetail, ArticleList, ArticleStatus } from '~/types/api'

/**
 * The article admin surface.
 *
 * Reads go through `useRequestFetch()` so the session cookie survives SSR;
 * writes use `$fetch` because they are imperative and only ever run client-side
 * from an event handler.
 *
 * No business logic here. Whether an article *can* be published is the API's
 * answer (`missingToPublish`), not something re-derived in the browser.
 */
export interface ArticleFilters {
  page?: number
  perPage?: number
  status?: ArticleStatus
  search?: string
  authorId?: string
}

export function useArticleList(filters: Ref<ArticleFilters>) {
  const requestFetch = useRequestFetch()

  return useAsyncData<ArticleList>(
    'articles',
    () =>
      requestFetch<ArticleList>('/api/backend/articles', {
        // Undefined keys are dropped by ofetch, so an unset filter simply is
        // not sent rather than being sent as the string "undefined".
        query: {
          page: filters.value.page,
          perPage: filters.value.perPage,
          status: filters.value.status,
          search: filters.value.search || undefined,
          authorId: filters.value.authorId,
        },
      }),
    // Re-runs on any filter change. A plain object here would capture the value
    // once and the list would silently stop updating.
    { watch: [filters] },
  )
}

export function useArticle(id: Ref<string>) {
  const requestFetch = useRequestFetch()

  return useAsyncData<ArticleDetail>(
    () => `article-${id.value}`,
    () => requestFetch<ArticleDetail>(`/api/backend/articles/${id.value}`),
    { watch: [id] },
  )
}

export function useArticleActions() {
  const create = (body: { title: string }) =>
    $fetch<ArticleDetail>('/api/backend/articles', {
      method: 'POST',
      body,
    })

  const update = (id: string, body: Record<string, unknown>) =>
    $fetch<ArticleDetail>(`/api/backend/articles/${id}`, {
      method: 'PATCH',
      body,
    })

  /**
   * Publish and unpublish are POSTs to sub-resources, not a status field on
   * PATCH. That mirrors the API deliberately: each transition has its own
   * guards, and a generic update must not become a way around them.
   */
  const publish = (id: string) =>
    $fetch<ArticleDetail>(`/api/backend/articles/${id}/publish`, {
      method: 'POST',
    })

  const unpublish = (id: string) =>
    $fetch<ArticleDetail>(`/api/backend/articles/${id}/unpublish`, {
      method: 'POST',
    })

  const remove = (id: string) =>
    $fetch(`/api/backend/articles/${id}`, { method: 'DELETE' })

  return { create, update, publish, unpublish, remove }
}
