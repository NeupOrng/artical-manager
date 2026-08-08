import type { Me } from '~/types/api'

/**
 * The current principal, as the API sees it.
 *
 * Deliberately sourced from the API rather than from the Kratos session. A valid
 * session proves an identity exists; it does NOT prove that identity is
 * provisioned as an author of a tenant. Only `/admin/v1/me` can answer that, and
 * the difference shows up as a 403 with a real session cookie present — a state
 * that is invisible if the UI trusts the session alone.
 */
export function useMe() {
  // `useRequestFetch()`, NOT `$fetch`. During SSR, plain $fetch does not carry
  // the browser's cookies into an internal call, so this request arrives at the
  // proxy with no session and 401s.
  //
  // The failure mode is what makes it worth spelling out: client-side navigation
  // works perfectly, and only a hard refresh of the same page breaks. That is
  // easy to ship and hard to notice. See backoffice/CLAUDE.md.
  const requestFetch = useRequestFetch()

  return useAsyncData<Me>('me', () => requestFetch<Me>('/api/backend/me'))
}

export type { Me }
