import {
  IdentityConflictError,
  IdentityUnavailableError,
  type IdentityProvider,
  type IdentityTraits,
  type IssuedRecoveryLink,
} from '../application/identity-ports';

/**
 * IdentityProvider over Kratos' ADMIN API.
 *
 * WRITTEN AGAINST KRATOS v1.3.1 — the pinned image. Verified by probing that
 * version (2026-09-28, one throwaway identity, deleted after):
 *   - POST /admin/identities without `credentials` → 201, `state: active`, and a
 *     recovery address of `email` is created from the trait.
 *   - GET /admin/identities?credentials_identifier=<username> finds a
 *     password-less identity (1 match) — which is what makes adoption possible.
 *   - POST /admin/recovery/link { identity_id, expires_in } → { recovery_link,
 *     expires_at }, the link pointing at the backoffice's own /.ory origin.
 *   - PATCH /admin/identities/{id} [{op:replace,path:/state,value:inactive}] →
 *     200, and a login attempt then fails with 401.
 *   - DELETE /admin/identities/{id}/sessions → 204.
 *
 * Traits are updated with PATCH, never PUT: a PUT replaces the whole identity,
 * and an incomplete body would take the password with it.
 *
 * THE ADMIN API IS INTERNAL ONLY (kratos:4434, never routed through Kong):
 * anything that can reach it can create logins and impersonate anyone.
 */

const TIMEOUT_MS = 3_000;

interface KratosIdentity {
  id: string;
  state?: string;
  traits?: { username?: string; email?: string; name?: string };
}

type Fetch = typeof fetch;

export class KratosIdentityProvider implements IdentityProvider {
  constructor(
    private readonly adminUrl: string,
    private readonly http: Fetch = fetch,
  ) {}

  async create(traits: IdentityTraits): Promise<{ identityId: string }> {
    const res = await this.call('/admin/identities', {
      method: 'POST',
      body: {
        schema_id: 'author',
        traits,
        // Deliberately NO credentials: the invite link is the only way in, so an
        // invited account cannot be signed into before its owner sets a password.
        // Unverified on purpose — the link is handed over by an admin, which
        // proves nothing about the address.
        verifiable_addresses: [
          { value: traits.email, via: 'email', verified: false, status: 'pending' },
        ],
      },
      allow: [201, 409],
    });

    if (res.status === 409) {
      // Kratos does not label which field collided, so ask: if the username
      // resolves, that is the conflict; otherwise it is the email, which Kratos
      // also keeps unique installation-wide (recovery addresses).
      const existing = await this.findByUsername(traits.username);
      throw new IdentityConflictError(existing ? 'username' : 'email');
    }

    const identity = res.body as KratosIdentity | null;
    if (!identity?.id) throw new IdentityUnavailableError('create returned no identity id');
    return { identityId: identity.id };
  }

  async findByUsername(username: string): Promise<{ identityId: string; email: string } | null> {
    const res = await this.call(
      `/admin/identities?credentials_identifier=${encodeURIComponent(username)}`,
      { allow: [200] },
    );
    const [identity] = (res.body as KratosIdentity[] | null) ?? [];
    if (!identity?.id) return null;
    return { identityId: identity.id, email: identity.traits?.email ?? '' };
  }

  async updateTraits(
    identityId: string,
    traits: Partial<Omit<IdentityTraits, 'username'>>,
  ): Promise<void> {
    const operations = Object.entries(traits)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => ({ op: 'replace', path: `/traits/${field}`, value }));
    if (operations.length === 0) return;

    const res = await this.call(`/admin/identities/${identityId}`, {
      method: 'PATCH',
      body: operations,
      allow: [200, 409],
    });
    // An email already used by another identity — Kratos keeps recovery
    // addresses unique across the whole installation.
    if (res.status === 409) throw new IdentityConflictError('email');
  }

  async setActive(identityId: string, active: boolean): Promise<void> {
    await this.call(`/admin/identities/${identityId}`, {
      method: 'PATCH',
      body: [{ op: 'replace', path: '/state', value: active ? 'active' : 'inactive' }],
      allow: [200],
    });
  }

  async revokeSessions(identityId: string): Promise<void> {
    // 404 means "no sessions", which is the desired end state, not a failure.
    await this.call(`/admin/identities/${identityId}/sessions`, {
      method: 'DELETE',
      allow: [204, 404],
    });
  }

  async issueRecoveryLink(identityId: string, expiresIn: string): Promise<IssuedRecoveryLink> {
    const res = await this.call('/admin/recovery/link', {
      method: 'POST',
      body: { identity_id: identityId, expires_in: expiresIn },
      allow: [200],
    });
    const body = res.body as { recovery_link?: string; expires_at?: string } | null;
    if (!body?.recovery_link) throw new IdentityUnavailableError('recovery link missing from response');
    return {
      link: body.recovery_link,
      expiresAt: body.expires_at ? new Date(body.expires_at) : new Date(Date.now() + 72 * 3600_000),
    };
  }

  async delete(identityId: string): Promise<void> {
    await this.call(`/admin/identities/${identityId}`, { method: 'DELETE', allow: [204, 404] });
  }

  private async call(
    path: string,
    options: { method?: string; body?: unknown; allow: number[] },
  ): Promise<{ status: number; body: unknown }> {
    let res: Response;
    try {
      res = await this.http(`${this.adminUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          'Content-Type': options.method === 'PATCH'
            // JSON Patch, per RFC 6902 — Kratos requires this content type.
            ? 'application/json-patch+json'
            : 'application/json',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
    catch (error) {
      const cause = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable';
      // The message carries the endpoint only — never traits, never a link.
      throw new IdentityUnavailableError(`${options.method ?? 'GET'} ${path.split('?')[0]} ${cause}`);
    }

    if (!options.allow.includes(res.status)) {
      throw new IdentityUnavailableError(`${options.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}`);
    }

    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}
