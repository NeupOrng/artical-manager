import { describe, it, expect } from 'vitest';
import { asTenantId } from '@core/shared';
import type { Author, AuthorRole } from './author';
import {
  assertCanChangeRole,
  assertCanDeactivate,
  isActive,
  normaliseAndValidateUsername,
  statusOf,
} from './access';
import { InvalidAuthorUsernameError, LastAdminError, SelfDeactivationError } from './errors';

const author = (over: Partial<Author> = {}): Author => ({
  id: 'author-1',
  tenantId: asTenantId('tenant-1'),
  kratosIdentityId: 'identity-1',
  username: 'mara-okonkwo',
  name: 'Mara Okonkwo',
  email: 'mara@example.test',
  quote: null,
  telegram: null,
  contactPublic: false,
  role: 'admin' as AuthorRole,
  avatarUrl: null,
  deactivatedAt: null,
  lastSeenAt: new Date('2026-09-01T00:00:00Z'),
  ...over,
});

describe('statusOf', () => {
  it('is invited until the first authenticated request', () => {
    expect(statusOf(author({ lastSeenAt: null }))).toBe('invited');
    expect(statusOf(author())).toBe('active');
  });

  it('is deactivated regardless of whether they ever signed in', () => {
    const at = new Date('2026-09-10T00:00:00Z');
    expect(statusOf(author({ deactivatedAt: at }))).toBe('deactivated');
    expect(statusOf(author({ deactivatedAt: at, lastSeenAt: null }))).toBe('deactivated');
  });
});

describe('isActive', () => {
  it('is about access, not about having signed in', () => {
    expect(isActive(author({ lastSeenAt: null }))).toBe(true);
    expect(isActive(author({ deactivatedAt: new Date() }))).toBe(false);
  });
});

describe('normaliseAndValidateUsername', () => {
  it('normalises before validating', () => {
    expect(normaliseAndValidateUsername('  Mara-Okonkwo ')).toBe('mara-okonkwo');
  });

  it('refuses anything that would need encoding in a URL', () => {
    for (const bad of ['mara okonkwo', 'maré', 'ab', '-mara', 'mara/okonkwo']) {
      expect(() => normaliseAndValidateUsername(bad)).toThrow(InvalidAuthorUsernameError);
    }
  });
});

describe('assertCanChangeRole', () => {
  it('refuses demoting the last active admin', () => {
    expect(() => assertCanChangeRole({ target: author(), activeAdmins: 1, newRole: 'editor' }))
      .toThrow(LastAdminError);
  });

  it('allows it once another admin exists', () => {
    expect(() => assertCanChangeRole({ target: author(), activeAdmins: 2, newRole: 'editor' }))
      .not.toThrow();
  });

  it('allows promoting to admin, and a no-op change, whatever the count', () => {
    expect(() => assertCanChangeRole({ target: author({ role: 'editor' }), activeAdmins: 0, newRole: 'admin' })).not.toThrow();
    expect(() => assertCanChangeRole({ target: author(), activeAdmins: 1, newRole: 'admin' })).not.toThrow();
  });

  it('does not count a deactivated admin as holding the site open', () => {
    const target = author({ deactivatedAt: new Date() });
    expect(() => assertCanChangeRole({ target, activeAdmins: 1, newRole: 'editor' })).not.toThrow();
  });
});

describe('assertCanDeactivate', () => {
  it('refuses deactivating yourself, before any other reason', () => {
    expect(() => assertCanDeactivate({ target: author(), activeAdmins: 5, actorId: 'author-1' }))
      .toThrow(SelfDeactivationError);
  });

  it('refuses the last active admin', () => {
    expect(() => assertCanDeactivate({ target: author(), activeAdmins: 1, actorId: 'someone-else' }))
      .toThrow(LastAdminError);
  });

  it('allows deactivating an editor, or an admin with a peer', () => {
    expect(() => assertCanDeactivate({ target: author({ role: 'editor' }), activeAdmins: 1, actorId: 'x' })).not.toThrow();
    expect(() => assertCanDeactivate({ target: author(), activeAdmins: 2, actorId: 'x' })).not.toThrow();
  });
});
