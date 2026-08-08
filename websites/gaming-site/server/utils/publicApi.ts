/**
 * The ONLY place the tenant key is used. It lives in server-only runtime
 * config and never crosses into client code.
 *
 * Pages must not call the API directly: a page-level useFetch runs in the
 * browser on client-side navigation, which would ship the key to every reader.
 * Pages call /api/* on this site; these helpers call the gateway.
 */
export async function publicApi<T>(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const config = useRuntimeConfig()

  return await $fetch<T>(path, {
    baseURL: `${config.apiBaseUrl}/public/v1`,
    headers: { 'X-Tenant-Key': config.tenantKey },
    query,
  })
}
