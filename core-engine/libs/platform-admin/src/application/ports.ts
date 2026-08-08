import type { PlatformAdmin } from '../domain/platform-admin';

export const PLATFORM_ADMIN_REPOSITORY = Symbol('PLATFORM_ADMIN_REPOSITORY');

/**
 * No method here takes a `tenantId`, and that is not an oversight — a platform
 * admin has no tenant. The tenant-first rule in docs/tenant-isolation.md governs
 * repositories for tenant-owned data (`authors`, `articles`, `categories`,
 * `media`); `platform_admins` is not tenant-owned, so there is nothing to scope
 * by.
 *
 * The rule this context DOES have to honour: nothing here may read or write
 * tenant data. If a platform admin ever needs to act inside a tenant, that gets
 * its own explicit code path with its own audit trail — not a bypass threaded
 * through these methods.
 */
export interface PlatformAdminRepository {
  /**
   * Resolves the identity the edge validated. Called once per request by the
   * principal guard, on the fallback path after `authors` misses.
   *
   * Returns the row even when inactive: the guard needs to tell "deactivated"
   * apart from "never existed", because they are different problems. Filtering
   * inactive rows out here would collapse them into the same 403 and make a
   * disabled account indistinguishable from a misconfigured edge.
   */
  findByKratosIdentityId(identityId: string): Promise<PlatformAdmin | null>;
}
