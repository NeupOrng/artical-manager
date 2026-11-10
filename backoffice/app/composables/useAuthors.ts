import type {
  Author,
  AuthorList,
  AuthorPatch,
  InviteAuthorInput,
  InviteLink,
  InvitedAuthor,
  PlatformTenantList,
} from '~/types/api'

/**
 * Who has access to THIS site. For a tenant admin.
 *
 * `useRequestFetch()` on the read, not `$fetch`: during SSR the browser's
 * cookies are not carried into an internal call, so a hard refresh would 401
 * while client-side navigation worked — the failure that is easy to ship and
 * hard to notice. See backoffice/CLAUDE.md.
 *
 * Writes use plain `$fetch`: they only ever run from a user action in the
 * browser, where the cookie is on the request already.
 */
export function useAuthorAdmin() {
  const requestFetch = useRequestFetch()

  const { data, refresh, ...rest } = useAsyncData<AuthorList>(
    'authors-admin',
    () => requestFetch<AuthorList>('/api/backend/authors'),
  )

  const authors = computed<Author[]>(() => data.value?.data ?? [])

  async function invite(input: InviteAuthorInput): Promise<InvitedAuthor> {
    const created = await $fetch<InvitedAuthor>('/api/backend/authors', {
      method: 'POST',
      body: input,
    })
    await refresh()
    return created
  }

  /**
   * A fresh link while the first is unaccepted. Returned, never stored — the
   * API cannot produce the same link twice and nothing here caches it.
   */
  async function reissue(id: string): Promise<InviteLink> {
    return await $fetch<InviteLink>(`/api/backend/authors/${id}/invite-link`, {
      method: 'POST',
    })
  }

  async function update(id: string, patch: AuthorPatch): Promise<Author> {
    const updated = await $fetch<Author>(`/api/backend/authors/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    await refresh()
    return updated
  }

  async function deactivate(id: string): Promise<Author> {
    const row = await $fetch<Author>(`/api/backend/authors/${id}/deactivate`, {
      method: 'POST',
    })
    await refresh()
    return row
  }

  async function reactivate(id: string): Promise<Author> {
    const row = await $fetch<Author>(`/api/backend/authors/${id}/reactivate`, {
      method: 'POST',
    })
    await refresh()
    return row
  }

  return { authors, data, refresh, ...rest, invite, reissue, update, deactivate, reactivate }
}

/**
 * The platform operator's view: every site, and the people on a chosen one.
 *
 * A SEPARATE composable from `useAuthorAdmin`, mirroring the API's separate
 * controller. The operator names a site; a tenant admin never can. Collapsing
 * the two into one "maybe there's a tenantId" helper is exactly the conditional
 * the server-side split exists to avoid.
 */
export function usePlatformAuthors() {
  const requestFetch = useRequestFetch()

  const { data: tenantData, ...tenantRest } = useAsyncData<PlatformTenantList>(
    'platform-tenants',
    () => requestFetch<PlatformTenantList>('/api/backend/platform/tenants'),
  )

  const tenants = computed(() => tenantData.value?.data ?? [])

  /** Which site is being looked at. Null until the operator picks one. */
  const selectedId = ref<string | null>(null)

  const {
    data: authorData,
    refresh: refreshAuthors,
    status: authorStatus,
    error: authorError,
  } = useAsyncData<AuthorList | null>(
    'platform-site-authors',
    () => selectedId.value
      ? requestFetch<AuthorList>(`/api/backend/platform/tenants/${selectedId.value}/authors`)
      : Promise.resolve(null),
    // Refetches when the operator switches site; without this the list would
    // keep showing the previous site's people under the new site's name.
    { watch: [selectedId] },
  )

  const authors = computed<Author[]>(() => authorData.value?.data ?? [])

  async function invite(input: InviteAuthorInput): Promise<InvitedAuthor> {
    if (!selectedId.value) throw new Error('Pick a site first.')
    const created = await $fetch<InvitedAuthor>(
      `/api/backend/platform/tenants/${selectedId.value}/authors`,
      { method: 'POST', body: input },
    )
    await Promise.all([refreshAuthors(), refreshNuxtData('platform-tenants')])
    return created
  }

  return {
    tenants,
    tenantStatus: tenantRest.status,
    tenantError: tenantRest.error,
    selectedId,
    authors,
    authorStatus,
    authorError,
    refreshAuthors,
    invite,
  }
}
