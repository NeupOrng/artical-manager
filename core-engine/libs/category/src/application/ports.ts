import type { CategoryId, TenantId } from '@core/shared';
import type { Category } from '../domain/category';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface CategoryWithUsage extends Category {
  /** Articles filed under it, ANY status. Shown before a retire is confirmed. */
  articleCount: number;
}

/**
 * What a public `/category/:slug` request resolves to.
 *
 * `redirect` carries the category's CURRENT slug, looked up through the
 * category rather than stored, so a section renamed twice (a → b → c) sends
 * both `a` and `b` straight to `c` with no chain to follow.
 */
export type SlugResolution =
  | { kind: 'category'; category: Category }
  | { kind: 'redirect'; slug: string };

/** tenantId first and required on every method — docs/tenant-isolation.md. */
export interface CategoryRepository {
  /**
   * LIVE categories only, in nav order. The public list reads this, so it must
   * never return a retired row.
   */
  list(tenantId: TenantId): Promise<CategoryWithUsage[]>;

  /** The admin list. Retired rows only when asked for, after the live ones. */
  listForAdmin(
    tenantId: TenantId,
    options: { includeRetired: boolean },
  ): Promise<CategoryWithUsage[]>;

  /** Live rows only — a retired category cannot be edited or assigned. */
  findById(tenantId: TenantId, id: CategoryId): Promise<Category | null>;

  /** Includes retired rows. Used only to restore one. */
  findByIdIncludingRetired(tenantId: TenantId, id: CategoryId): Promise<Category | null>;

  /**
   * Live rows only. Used to enforce slug uniqueness before writing, so the
   * user gets a domain error rather than a raw constraint violation.
   */
  findBySlug(tenantId: TenantId, slug: string): Promise<Category | null>;

  /** The slot after the last live category — where new and restored ones land. */
  nextPosition(tenantId: TenantId): Promise<number>;

  /** Also releases any redirect claiming this slug: a live category always wins. */
  create(tenantId: TenantId, category: Category): Promise<void>;

  /**
   * Persists an edit. When `previousSlug` differs from the new slug, the old one
   * is recorded as a redirect to this category — in the same transaction, so a
   * slug change can never land without its redirect.
   */
  update(
    tenantId: TenantId,
    category: Category,
    options?: { previousSlug?: string },
  ): Promise<void>;

  /** Sets deleted_at. Articles keep their category_id; nothing is destroyed. */
  softDelete(tenantId: TenantId, id: CategoryId): Promise<void>;

  /** Clears deleted_at and appends it to the nav at `position`. */
  restore(tenantId: TenantId, id: CategoryId, position: number): Promise<void>;

  /** Writes a whole nav order atomically. Validate it first with `orderFromIds`. */
  setPositions(
    tenantId: TenantId,
    order: { id: CategoryId; position: number }[],
  ): Promise<void>;

  /** Live category first; otherwise a redirect to a LIVE category; else null. */
  resolveSlug(tenantId: TenantId, slug: string): Promise<SlugResolution | null>;
}
