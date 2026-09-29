import type { AuthorRole } from './author';

/**
 * What a tenant author may do, named by the action rather than by the role.
 *
 * ONE place decides authorization. Endpoints annotate a permission; this table
 * says which roles hold it. The day permissions become relational and move to
 * Keto (infrastructure/ory/keto/README.md), this file is what the Keto model
 * replaces — endpoints, guards and UI stay as they are.
 *
 * Derived 1:1 from the `@Roles(...)` annotations that were on the endpoints
 * before this existed (2026-09-28). Behaviour did not change in that step, and
 * the pre-existing role integration tests are what proves it.
 */

export const PERMISSIONS = [
  'dashboard.read',
  'articles.read',
  'articles.write',
  'articles.publish',
  'articles.delete',
  'categories.read',
  'categories.manage',
  'media.read',
  'media.upload',
  'media.delete',
  'authors.read',
  'authors.invite',
  'authors.update',
  'authors.deactivate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Contributors: write their own work and use the library.
 *
 * `media.*` sits here — including `media.delete` — because the media endpoints
 * carried NO role check at all before permissions existed, and this table had to
 * reproduce that exactly rather than quietly tighten it. Whether a contributor
 * should be able to delete from the shared library is a real question; changing
 * it is a decision, and it belongs in this table when it is made.
 */
const CONTRIBUTOR: readonly Permission[] = [
  'dashboard.read',
  'articles.read',
  'articles.write',
  'categories.read',
  'media.read',
  'media.upload',
  'media.delete',
];

/** Editors decide what readers see, and own the taxonomy. */
const EDITOR: readonly Permission[] = [
  ...CONTRIBUTOR,
  'articles.publish',
  'articles.delete',
  'categories.manage',
];

/** Admins additionally manage who has access to the site. */
const ADMIN: readonly Permission[] = [
  ...EDITOR,
  'authors.read',
  'authors.invite',
  'authors.update',
  'authors.deactivate',
];

/**
 * Nested by construction — each role spreads the one below it. That is the
 * ranked ladder the old `RANK` comparison expressed, kept as data so a role
 * cannot accidentally gain a permission the role above it lacks.
 */
export const ROLE_PERMISSIONS: Record<AuthorRole, readonly Permission[]> = {
  contributor: CONTRIBUTOR,
  editor: EDITOR,
  admin: ADMIN,
};

export function roleHasPermission(role: AuthorRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** What the backoffice is told, so its UI hides controls by permission, never by role. */
export function permissionsFor(role: AuthorRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
