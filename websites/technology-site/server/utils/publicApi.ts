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

  // `$fetch` widens its return to TypedInternalResponse, which tries to infer a
  // body type from the route string. That inference is for internal /api/*
  // routes; these calls go to the external gateway, so it resolves to something
  // unrelated to T and will not narrow. The generic here is the real contract —
  // callers pass the DTO from types/api.ts — so the assertion is asserting what
  // the caller already declared, not papering over an unknown.
  return await $fetch<T>(path, {
    baseURL: `${config.apiBaseUrl}/public/v1`,
    headers: { 'X-Tenant-Key': config.tenantKey },
    query,
  }) as T
}

/**
 * POST variant, for the one public write the sites make: recording a view.
 *
 * Same rule as above — the tenant key never leaves the server, so the browser
 * posts to this site's own /api/* route and this forwards it.
 */
export async function publicApiPost<T>(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<T> {
  const config = useRuntimeConfig()

  return await $fetch<T>(path, {
    method: 'POST',
    baseURL: `${config.apiBaseUrl}/public/v1`,
    // The tenant key last, so no caller-supplied header can replace it.
    headers: { ...headers, 'X-Tenant-Key': config.tenantKey },
    body,
  }) as T
}
