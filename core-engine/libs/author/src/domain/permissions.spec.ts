import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsFor,
  roleHasPermission,
  type Permission,
} from './permissions';

describe('the permission table', () => {
  it('nests: everything a contributor may do, an editor may, and an admin may', () => {
    for (const p of ROLE_PERMISSIONS.contributor) {
      expect(ROLE_PERMISSIONS.editor).toContain(p);
    }
    for (const p of ROLE_PERMISSIONS.editor) {
      expect(ROLE_PERMISSIONS.admin).toContain(p);
    }
  });

  it('grants every declared permission to somebody', () => {
    // Catches a permission added to the union and forgotten in the table —
    // which would otherwise be an endpoint nobody on earth can call.
    const granted = new Set<Permission>(ROLE_PERMISSIONS.admin);
    expect([...PERMISSIONS].filter(p => !granted.has(p))).toEqual([]);
  });

  it('declares no permission twice for a role', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      const list = ROLE_PERMISSIONS[role];
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('keeps author management to admins', () => {
    for (const p of ['authors.read', 'authors.invite', 'authors.update', 'authors.deactivate'] as const) {
      expect(roleHasPermission('admin', p)).toBe(true);
      expect(roleHasPermission('editor', p)).toBe(false);
      expect(roleHasPermission('contributor', p)).toBe(false);
    }
  });

  it('reproduces the role ladder the endpoints had before permissions existed', () => {
    // contributor-level endpoints
    expect(roleHasPermission('contributor', 'articles.read')).toBe(true);
    expect(roleHasPermission('contributor', 'articles.write')).toBe(true);
    expect(roleHasPermission('contributor', 'categories.read')).toBe(true);
    // editor-level endpoints
    expect(roleHasPermission('contributor', 'articles.publish')).toBe(false);
    expect(roleHasPermission('contributor', 'articles.delete')).toBe(false);
    expect(roleHasPermission('contributor', 'categories.manage')).toBe(false);
    expect(roleHasPermission('editor', 'articles.publish')).toBe(true);
    expect(roleHasPermission('editor', 'categories.manage')).toBe(true);
    // media carried NO role check before, so every author keeps it
    expect(roleHasPermission('contributor', 'media.upload')).toBe(true);
    expect(roleHasPermission('contributor', 'media.delete')).toBe(true);
  });

  it('hands out a copy, so a caller cannot mutate the table', () => {
    const mine = permissionsFor('contributor');
    mine.push('authors.invite');
    expect(roleHasPermission('contributor', 'authors.invite')).toBe(false);
  });
});
