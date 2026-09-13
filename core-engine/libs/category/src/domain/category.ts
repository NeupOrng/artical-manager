import { asCategoryId, slugify, type CategoryId, type TenantId } from '@core/shared';
import {
  EmptyCategoryNameError,
  InvalidCategoryOrderError,
  UnsluggableCategoryNameError,
} from './errors';

/**
 * Tenant taxonomy. A thin context by design — see core-engine/CLAUDE.md,
 * "Intentional asymmetry": a category has no state machine, so there is no
 * aggregate here and there should not be one.
 *
 * What DOES live here are the rules that must hold wherever a category is
 * written: what a slug may be (it lands in a public URL, `/category/:slug`),
 * what counts as an empty description, and what a valid nav order is.
 */
export interface Category {
  readonly id: CategoryId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly slug: string;
  /**
   * One or two sentences for the section page and its meta / og:description.
   * Null is normal — the sites fall back to a generic line.
   */
  readonly description: string | null;
  /** Ascending order in the tenant's navigation. */
  readonly position: number;
  /** Retired. Hidden from pickers and public listings; rows are kept. */
  readonly deletedAt: Date | null;
}

/**
 * Blank and whitespace-only collapse to null, so "cleared" and "never set" are
 * one state — the sites then only have to check for null.
 */
function normaliseDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Derives the stored shape from user input.
 *
 * Slug is derived from the name unless one is given explicitly, matching how
 * articles behave — an editor should not have to think about URLs to create a
 * section, but must be able to control one when it matters.
 */
export function makeCategory(input: {
  id: CategoryId;
  tenantId: TenantId;
  name: string;
  slug?: string;
  description?: string | null;
  /**
   * Where it lands in the nav. The caller passes the next free slot, so a new
   * section appears at the END — appearing first would reshuffle a live site's
   * navigation as a side effect of creating something.
   */
  position: number;
}): Category {
  const name = input.name.trim();
  if (!name) throw new EmptyCategoryNameError();

  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  if (!slug) throw new UnsluggableCategoryNameError(input.name);

  return {
    id: input.id,
    tenantId: input.tenantId,
    name,
    slug,
    description: normaliseDescription(input.description),
    position: input.position,
    deletedAt: null,
  };
}

/**
 * Applies an edit. Every field is optional — this backs a PATCH, so `undefined`
 * means "not supplied". For `description`, `null` means "clear it".
 *
 * Note the slug is editable, unlike an article's. A category slug is a section
 * URL an editor may legitimately want to correct, the blast radius is one
 * listing page rather than every shared link to a story, and the old slug keeps
 * working as a redirect.
 */
export function applyCategoryEdit(
  category: Category,
  changes: { name?: string; slug?: string; description?: string | null },
): Category {
  let { name, slug, description } = category;

  if (changes.name !== undefined) {
    const next = changes.name.trim();
    if (!next) throw new EmptyCategoryNameError();
    name = next;
  }

  if (changes.slug !== undefined) {
    const next = slugify(changes.slug);
    if (!next) throw new UnsluggableCategoryNameError(changes.slug);
    slug = next;
  }

  if (changes.description !== undefined) {
    description = normaliseDescription(changes.description);
  }

  return { ...category, name, slug, description };
}

export function isRetired(category: Pick<Category, 'deletedAt'>): boolean {
  return category.deletedAt !== null;
}

/**
 * Turns a requested nav order into positions, refusing anything that is not
 * EXACTLY the tenant's live categories, each once.
 *
 * Strict because the failure it prevents is silent. An editor's page is a
 * snapshot: if a colleague created or retired a category since it loaded, a
 * partial order would leave that category's position untouched and colliding
 * with one of the new ones, and nav would order the two arbitrarily — possibly
 * differently in the admin and on the sites. Refusing makes the editor reload.
 */
export function orderFromIds(
  requested: readonly string[],
  live: readonly Pick<Category, 'id'>[],
): { id: CategoryId; position: number }[] {
  const liveIds = new Set<string>(live.map(c => c.id));
  const seen = new Set<string>();
  const unknown: string[] = [];
  const duplicated: string[] = [];

  for (const id of requested) {
    if (!liveIds.has(id)) unknown.push(id);
    else if (seen.has(id)) duplicated.push(id);
    seen.add(id);
  }

  const missing = [...liveIds].filter(id => !seen.has(id));

  if (unknown.length || duplicated.length || missing.length) {
    throw new InvalidCategoryOrderError({ missing, unknown, duplicated });
  }

  return requested.map((id, position) => ({ id: asCategoryId(id), position }));
}
