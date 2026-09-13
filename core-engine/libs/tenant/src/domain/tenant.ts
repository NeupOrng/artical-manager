import type { TenantId } from '@core/shared';

/**
 * Thin context by design — a Tenant carries no invariants of its own.
 * See core-engine/CLAUDE.md: don't manufacture an aggregate for a table
 * that is genuinely CRUD.
 */
export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  readonly domain: string;
  readonly nicheLabel: string;
  /** Umami website for readership analytics; null = not provisioned. */
  readonly umamiWebsiteId: string | null;
}
