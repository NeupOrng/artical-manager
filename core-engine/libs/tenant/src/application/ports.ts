import type { TenantId } from '@core/shared';
import type { Tenant } from '../domain/tenant';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

/**
 * A tenant plus operational counts, for the platform admin's dashboard.
 *
 * WHAT IS DELIBERATELY ABSENT: article titles, slugs, excerpts, and anything
 * else a reader would recognise as content. Only aggregates.
 *
 * That line is the whole design. Root CLAUDE.md §1 says a platform admin has no
 * access to any tenant's content, and this respects it: a count answers "is this
 * site alive and being worked on", which is an operator's question, without
 * exposing a single thing anyone wrote. If a future change wants titles here,
 * that is a reversal of §1 and needs deciding, not a field addition.
 */
export interface TenantWithStats {
  id: TenantId;
  name: string;
  domain: string;
  nicheLabel: string;
  authorCount: number;
  publishedCount: number;
  draftCount: number;
}

export interface TenantRepository {
  findById(tenantId: TenantId): Promise<Tenant | null>;

  /**
   * DELIBERATELY NOT TENANT-SCOPED — the second such method in this codebase,
   * after MediaRepository.claimPending, and for a comparable reason: the caller
   * has no tenant to scope by.
   *
   * This is the PLATFORM surface. It may only ever be reached from a route
   * carrying `@PlatformAdminOnly()`, because a platform principal has no
   * `tenantId` and therefore cannot call anything else here. A tenant author
   * must never reach this — it would hand them a list of every other site.
   *
   * Enforced by the guard, not by this signature, which is exactly why the
   * constraint is written down rather than left implied.
   */
  listAllWithStats(): Promise<TenantWithStats[]>;
}
