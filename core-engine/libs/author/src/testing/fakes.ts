import type { TenantId } from '@core/shared';
import type { Author } from '../domain/author';
import { statusOf } from '../domain/access';
import type {
  AuthorChanges,
  AuthorRepository,
  AuthorWithUsage,
  NewAuthor,
} from '../application/ports';
import {
  IdentityConflictError,
  type IdentityProvider,
  type IdentityTraits,
  type IssuedRecoveryLink,
} from '../application/identity-ports';

/**
 * In-memory ports for application tests — no database, no Kratos, per the
 * testing convention in core-engine/CLAUDE.md. Not exported from the lib index;
 * test files import this by path.
 */

export class FakeAuthorRepository implements AuthorRepository {
  constructor(public rows: Author[] = []) {}

  async findByUsername(tenantId: TenantId, username: string): Promise<Author | null> {
    return this.rows.find(a => a.tenantId === tenantId && a.username === username) ?? null;
  }

  async findById(tenantId: TenantId, authorId: string): Promise<Author | null> {
    return this.rows.find(a => a.tenantId === tenantId && a.id === authorId) ?? null;
  }

  async findByKratosIdentityId(identityId: string): Promise<Author | null> {
    return this.rows.find(a => a.kratosIdentityId === identityId) ?? null;
  }

  async listForAdmin(tenantId: TenantId): Promise<AuthorWithUsage[]> {
    return this.rows
      .filter(a => a.tenantId === tenantId)
      .map(a => ({ ...a, status: statusOf(a), publishedCount: 0, draftCount: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(tenantId: TenantId, author: NewAuthor): Promise<void> {
    this.rows.push({
      ...author,
      tenantId,
      quote: null,
      telegram: null,
      contactPublic: false,
      avatarUrl: null,
      deactivatedAt: null,
      lastSeenAt: null,
    });
  }

  async update(tenantId: TenantId, authorId: string, changes: AuthorChanges): Promise<void> {
    const row = await this.findById(tenantId, authorId);
    if (row) Object.assign(row, changes);
  }

  async setDeactivated(tenantId: TenantId, authorId: string, at: Date | null): Promise<void> {
    const row = await this.findById(tenantId, authorId);
    if (row) row.deactivatedAt = at;
  }

  async countActiveAdmins(tenantId: TenantId): Promise<number> {
    return this.rows.filter(
      a => a.tenantId === tenantId && a.role === 'admin' && a.deactivatedAt === null,
    ).length;
  }

  async existsWithUsername(tenantId: TenantId, username: string): Promise<boolean> {
    return Boolean(await this.findByUsername(tenantId, username));
  }

  async touchLastSeen(tenantId: TenantId, authorId: string): Promise<void> {
    const row = await this.findById(tenantId, authorId);
    if (row) row.lastSeenAt = new Date();
  }
}

interface FakeIdentity {
  id: string;
  username: string;
  email: string;
  name: string;
  active: boolean;
  sessions: number;
}

/**
 * Enforces what the real identity service enforces and nothing else: usernames
 * and email addresses are unique ACROSS the whole store, not per tenant.
 */
export class FakeIdentityProvider implements IdentityProvider {
  identities: FakeIdentity[] = [];
  links: { identityId: string; expiresIn: string }[] = [];
  /** Set to make the next call of a given method fail, as an outage would. */
  failOn: Partial<Record<keyof IdentityProvider, Error>> = {};
  private sequence = 0;

  private maybeFail(method: keyof IdentityProvider) {
    const error = this.failOn[method];
    if (error) {
      delete this.failOn[method];
      throw error;
    }
  }

  async create(traits: IdentityTraits): Promise<{ identityId: string }> {
    this.maybeFail('create');
    if (this.identities.some(i => i.username === traits.username)) {
      throw new IdentityConflictError('username');
    }
    if (this.identities.some(i => i.email === traits.email)) {
      throw new IdentityConflictError('email');
    }
    const identity: FakeIdentity = {
      id: `identity-${++this.sequence}`,
      username: traits.username,
      email: traits.email,
      name: traits.name,
      active: true,
      sessions: 1,
    };
    this.identities.push(identity);
    return { identityId: identity.id };
  }

  async findByUsername(username: string): Promise<{ identityId: string; email: string } | null> {
    const found = this.identities.find(i => i.username === username);
    return found ? { identityId: found.id, email: found.email } : null;
  }

  async updateTraits(
    identityId: string,
    traits: Partial<Omit<IdentityTraits, 'username'>>,
  ): Promise<void> {
    this.maybeFail('updateTraits');
    if (traits.email && this.identities.some(i => i.email === traits.email && i.id !== identityId)) {
      throw new IdentityConflictError('email');
    }
    const identity = this.identities.find(i => i.id === identityId);
    if (identity) Object.assign(identity, traits);
  }

  async setActive(identityId: string, active: boolean): Promise<void> {
    this.maybeFail('setActive');
    const identity = this.identities.find(i => i.id === identityId);
    if (identity) identity.active = active;
  }

  async revokeSessions(identityId: string): Promise<void> {
    this.maybeFail('revokeSessions');
    const identity = this.identities.find(i => i.id === identityId);
    if (identity) identity.sessions = 0;
  }

  async issueRecoveryLink(identityId: string, expiresIn: string): Promise<IssuedRecoveryLink> {
    this.maybeFail('issueRecoveryLink');
    this.links.push({ identityId, expiresIn });
    return {
      link: `http://localhost:3001/.ory/self-service/recovery?flow=${identityId}`,
      expiresAt: new Date('2026-12-31T00:00:00Z'),
    };
  }

  async delete(identityId: string): Promise<void> {
    this.identities = this.identities.filter(i => i.id !== identityId);
  }
}
