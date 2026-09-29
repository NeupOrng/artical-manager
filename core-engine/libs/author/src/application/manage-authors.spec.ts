import { describe, it, expect, beforeEach } from 'vitest';
import { asTenantId } from '@core/shared';
import type { Author } from '../domain/author';
import {
  AuthorAlreadyActiveError,
  AuthorDeactivatedError,
  AuthorEmailInUseError,
  AuthorNotFoundError,
  AuthorUsernameTakenError,
  LastAdminError,
  SelfDeactivationError,
} from '../domain/errors';
import { FakeAuthorRepository, FakeIdentityProvider } from '../testing/fakes';
import {
  deactivateAuthor,
  inviteAuthor,
  reactivateAuthor,
  reissueInvite,
  updateAuthor,
} from './manage-authors';
import { IdentityUnavailableError } from './identity-ports';

const TECH = asTenantId('tenant-tech');
const GAMING = asTenantId('tenant-gaming');
const NOW = new Date('2026-09-28T10:00:00Z');

const author = (over: Partial<Author> = {}): Author => ({
  id: 'author-admin',
  tenantId: TECH,
  kratosIdentityId: 'identity-admin',
  username: 'mara-okonkwo',
  name: 'Mara Okonkwo',
  email: 'mara@example.test',
  quote: null,
  telegram: null,
  contactPublic: false,
  role: 'admin',
  avatarUrl: null,
  deactivatedAt: null,
  lastSeenAt: new Date('2026-09-20T00:00:00Z'),
  ...over,
});

let authors: FakeAuthorRepository;
let identities: FakeIdentityProvider;
let deps: { authors: FakeAuthorRepository; identities: FakeIdentityProvider };

beforeEach(() => {
  authors = new FakeAuthorRepository([author()]);
  identities = new FakeIdentityProvider();
  identities.identities.push({
    id: 'identity-admin', username: 'mara-okonkwo', email: 'mara@example.test',
    name: 'Mara Okonkwo', active: true, sessions: 1,
  });
  deps = { authors, identities };
});

const invite = (over: Partial<Parameters<typeof inviteAuthor>[1]> = {}) =>
  inviteAuthor(deps, { tenantId: TECH, username: 'Nina-Sato', name: ' Nina Sato ', email: ' NINA@example.test ', role: 'contributor', ...over });

describe('inviteAuthor', () => {
  it('creates a password-less login, the row, and a link — normalising as it goes', async () => {
    const { authorId, invite: link } = await invite();

    const created = await authors.findById(TECH, authorId);
    expect(created).toMatchObject({ username: 'nina-sato', name: 'Nina Sato', email: 'nina@example.test', role: 'contributor' });
    // Invited, not active: nothing has authenticated as them yet.
    expect(created?.lastSeenAt).toBeNull();
    expect(identities.links).toEqual([{ identityId: created!.kratosIdentityId, expiresIn: '72h' }]);
    expect(link.link).toContain('/.ory/self-service/recovery');
  });

  it('refuses a username this site already uses, without touching the identity service', async () => {
    await expect(invite({ username: 'mara-okonkwo' })).rejects.toBeInstanceOf(AuthorUsernameTakenError);
    expect(identities.identities).toHaveLength(1);
  });

  it('refuses a username held by another site — identities are unique installation-wide', async () => {
    // Somebody on the gaming site already owns it, so the login exists and IS claimed.
    authors.rows.push(author({ id: 'gaming-1', tenantId: GAMING, kratosIdentityId: 'identity-gaming', username: 'shared-handle' }));
    identities.identities.push({ id: 'identity-gaming', username: 'shared-handle', email: 'g@example.test', name: 'G', active: true, sessions: 0 });

    await expect(invite({ username: 'shared-handle' })).rejects.toBeInstanceOf(AuthorUsernameTakenError);
  });

  it('adopts an ORPHAN login left by an invite that died half-way', async () => {
    // The login exists but no author row references it — exactly the state a
    // failure between the two writes leaves behind.
    identities.identities.push({ id: 'identity-orphan', username: 'nina-sato', email: 'nina@example.test', name: 'Nina Sato', active: true, sessions: 0 });

    const { authorId } = await invite();
    expect((await authors.findById(TECH, authorId))?.kratosIdentityId).toBe('identity-orphan');
    expect(identities.identities.filter(i => i.username === 'nina-sato')).toHaveLength(1);
  });

  it('reports an email that already has an account', async () => {
    await expect(invite({ email: 'mara@example.test' })).rejects.toBeInstanceOf(AuthorEmailInUseError);
  });

  it('leaves an adoptable login when saving the row fails, so a retry succeeds', async () => {
    const create = authors.create.bind(authors);
    authors.create = () => Promise.reject(new Error('database gone'));
    await expect(invite()).rejects.toThrow('database gone');

    authors.create = create;
    const { authorId } = await invite();
    expect((await authors.findById(TECH, authorId))?.username).toBe('nina-sato');
    expect(identities.identities.filter(i => i.username === 'nina-sato')).toHaveLength(1);
  });

  it('refuses a username that cannot be a URL', async () => {
    await expect(invite({ username: 'nina sato' })).rejects.toThrow(/username/i);
  });
});

describe('reissueInvite', () => {
  it('works only while the invite is unaccepted', async () => {
    const { authorId } = await invite();
    await expect(reissueInvite(deps, { tenantId: TECH, authorId })).resolves.toMatchObject({ link: expect.any(String) });

    // Once they have signed in, a reset is theirs to start from the login page.
    await expect(reissueInvite(deps, { tenantId: TECH, authorId: 'author-admin' }))
      .rejects.toBeInstanceOf(AuthorAlreadyActiveError);
  });

  it('refuses for a deactivated author, and 404s across sites', async () => {
    const { authorId } = await invite();
    await authors.setDeactivated(TECH, authorId, NOW);
    await expect(reissueInvite(deps, { tenantId: TECH, authorId })).rejects.toBeInstanceOf(AuthorDeactivatedError);
    await expect(reissueInvite(deps, { tenantId: GAMING, authorId })).rejects.toBeInstanceOf(AuthorNotFoundError);
  });
});

describe('updateAuthor', () => {
  const update = (changes: Parameters<typeof updateAuthor>[1]['changes'], authorId = 'author-admin') =>
    updateAuthor(deps, { tenantId: TECH, actorId: 'author-admin', authorId, changes });

  it('updates the login traits and the row', async () => {
    await update({ name: 'Mara O.', email: 'MARA.O@example.test ' });

    expect(await authors.findById(TECH, 'author-admin')).toMatchObject({ name: 'Mara O.', email: 'mara.o@example.test' });
    expect(identities.identities[0]).toMatchObject({ name: 'Mara O.', email: 'mara.o@example.test' });
  });

  it('does not call the identity service when nothing it owns changed', async () => {
    identities.failOn.updateTraits = new Error('should not be called');
    await expect(update({ role: 'admin' })).resolves.toBeUndefined();
  });

  it('reports an email another account holds', async () => {
    const { authorId } = await invite();
    await expect(update({ email: 'nina@example.test' }, 'author-admin')).rejects.toBeInstanceOf(AuthorEmailInUseError);
    expect(authorId).toBeTruthy();
  });

  it('refuses to demote the last admin', async () => {
    await expect(update({ role: 'editor' })).rejects.toBeInstanceOf(LastAdminError);
  });

  it('allows the demotion once another admin exists', async () => {
    authors.rows.push(author({ id: 'author-2', kratosIdentityId: 'identity-2', username: 'second-admin', email: 's@example.test' }));
    await expect(update({ role: 'editor' })).resolves.toBeUndefined();
  });

  it('refuses editing a deactivated author, and 404s across sites', async () => {
    const { authorId } = await invite();
    await authors.setDeactivated(TECH, authorId, NOW);
    await expect(update({ name: 'X' }, authorId)).rejects.toBeInstanceOf(AuthorDeactivatedError);
    await expect(updateAuthor(deps, { tenantId: GAMING, actorId: 'x', authorId, changes: { name: 'X' } }))
      .rejects.toBeInstanceOf(AuthorNotFoundError);
  });
});

describe('deactivateAuthor', () => {
  const deactivate = (authorId: string, actorId = 'author-admin') =>
    deactivateAuthor(deps, { tenantId: TECH, actorId, authorId, now: NOW });

  it('sets the flag, disables the login, and ends sessions', async () => {
    const { authorId } = await invite();
    await deactivate(authorId);

    expect((await authors.findById(TECH, authorId))?.deactivatedAt).toEqual(NOW);
    const identity = identities.identities.find(i => i.username === 'nina-sato');
    expect(identity).toMatchObject({ active: false, sessions: 0 });
  });

  it('refuses your own account before anything else', async () => {
    await expect(deactivate('author-admin')).rejects.toBeInstanceOf(SelfDeactivationError);
  });

  it('refuses the last active admin', async () => {
    authors.rows.push(author({ id: 'author-2', kratosIdentityId: 'identity-2', username: 'other-admin', email: 'o@example.test' }));
    // Two admins: the second may go.
    await expect(deactivate('author-2')).resolves.toBeUndefined();
    // Now one remains, and nobody may remove them.
    await expect(deactivateAuthor(deps, { tenantId: TECH, actorId: 'author-2', authorId: 'author-admin', now: NOW }))
      .rejects.toBeInstanceOf(LastAdminError);
  });

  it('keeps the flag when the identity service fails, and a retry finishes the job', async () => {
    const { authorId } = await invite();
    identities.failOn.setActive = new IdentityUnavailableError('PATCH /admin/identities timed out');

    await expect(deactivate(authorId)).rejects.toBeInstanceOf(IdentityUnavailableError);
    // Locked out of the API already — that is why the row is written first.
    expect((await authors.findById(TECH, authorId))?.deactivatedAt).toEqual(NOW);

    await expect(deactivate(authorId)).resolves.toBeUndefined();
    expect(identities.identities.find(i => i.username === 'nina-sato')).toMatchObject({ active: false, sessions: 0 });
  });

  it('404s across sites', async () => {
    await expect(deactivateAuthor(deps, { tenantId: GAMING, actorId: 'x', authorId: 'author-admin', now: NOW }))
      .rejects.toBeInstanceOf(AuthorNotFoundError);
  });
});

describe('reactivateAuthor', () => {
  it('clears the flag and re-enables the login', async () => {
    const { authorId } = await invite();
    await deactivateAuthor(deps, { tenantId: TECH, actorId: 'author-admin', authorId, now: NOW });

    await reactivateAuthor(deps, { tenantId: TECH, authorId });
    expect((await authors.findById(TECH, authorId))?.deactivatedAt).toBeNull();
    expect(identities.identities.find(i => i.username === 'nina-sato')?.active).toBe(true);
    // Sessions are NOT restored — they sign in again.
    expect(identities.identities.find(i => i.username === 'nina-sato')?.sessions).toBe(0);
  });
});
