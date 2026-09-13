import type {
  Category,
  CategoryInput,
  CategoryList,
  CategoryPatch,
} from '~/types/api'

/**
 * The tenant's LIVE categories, for the article editor's picker.
 *
 * Shared cache key on purpose: the taxonomy is small, changes rarely, and every
 * article the author opens needs the same list. A per-page key would refetch it
 * on every navigation for no benefit.
 *
 * Retired categories are already excluded server-side, so nothing here filters —
 * "which categories may I choose" is the API's answer, not a UI preference.
 */
export function useCategories() {
  const requestFetch = useRequestFetch()

  const { data, ...rest } = useAsyncData<CategoryList>(
    'categories',
    // useRequestFetch, not $fetch: during SSR the browser's cookies are not
    // carried into internal calls and this would 401 on a hard refresh only.
    () => requestFetch<CategoryList>('/api/backend/categories'),
  )

  const categories = computed<Category[]>(() => data.value?.data ?? [])

  return { categories, data, ...rest }
}

/**
 * The categories page: every category including retired ones, plus the writes.
 *
 * A separate cache key from the picker because it is a different question
 * ("everything, for managing" vs "what may I file under"). Every write refreshes
 * BOTH, so an editor who renames a category and opens an article sees the new
 * name without a reload.
 */
export function useCategoryAdmin() {
  const requestFetch = useRequestFetch()

  const { data, refresh, ...rest } = useAsyncData<CategoryList>(
    'categories-admin',
    () => requestFetch<CategoryList>('/api/backend/categories', {
      query: { include: 'retired' },
    }),
  )

  const all = computed<Category[]>(() => data.value?.data ?? [])
  // The API already orders live-first in nav order; this only splits the list.
  const live = computed(() => all.value.filter(c => !c.retiredAt))
  const retired = computed(() => all.value.filter(c => c.retiredAt))

  const refreshBoth = () => Promise.all([refresh(), refreshNuxtData('categories')])

  async function create(input: CategoryInput) {
    const created = await $fetch<Category>('/api/backend/categories', {
      method: 'POST',
      body: input,
    })
    await refreshBoth()
    return created
  }

  async function update(id: string, patch: CategoryPatch) {
    const updated = await $fetch<Category>(`/api/backend/categories/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    await refreshBoth()
    return updated
  }

  async function retire(id: string) {
    await $fetch(`/api/backend/categories/${id}`, { method: 'DELETE' })
    await refreshBoth()
  }

  async function restore(id: string) {
    const restored = await $fetch<Category>(`/api/backend/categories/${id}/restore`, {
      method: 'POST',
    })
    await refreshBoth()
    return restored
  }

  /** Every live id, in the new order. A partial list is refused (409). */
  async function reorder(ids: string[]) {
    await $fetch<CategoryList>('/api/backend/categories/reorder', {
      method: 'POST',
      body: { ids },
    })
    await refreshBoth()
  }

  return {
    all,
    live,
    retired,
    data,
    refresh,
    ...rest,
    create,
    update,
    retire,
    restore,
    reorder,
  }
}
