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
