import { describe, it, expect } from 'vitest';
import {
  isValidUsername,
  normaliseUsername,
  toPublicProfile,
  type AuthorProfileFields,
} from './author';

/**
 * Domain tests: plain unit tests, zero mocks. That is the payoff for keeping
 * this layer pure — if one of these needed a mock, the layering had slipped.
 */

function anAuthor(over: Partial<AuthorProfileFields> = {}): AuthorProfileFields {
  return {
    username: 'mara-okonkwo',
    name: 'Mara Okonkwo',
    email: 'mara@example.test',
    quote: 'I take things apart.',
    telegram: '@mara',
    contactPublic: false,
    // Null is the realistic default: authors register through Kratos with
    // nothing uploaded, so most profiles have no picture.
    avatarUrl: null,
    ...over,
  };
}

describe('username rules', () => {
  it('accepts lowercase handles with digits, hyphen and underscore', () => {
    expect(isValidUsername('mara-okonkwo')).toBe(true);
    expect(isValidUsername('devin_h2')).toBe(true);
  });

  it('rejects anything needing percent-encoding in a URL', () => {
    expect(isValidUsername('mara okonkwo')).toBe(false);
    expect(isValidUsername('mara/okonkwo')).toBe(false);
    expect(isValidUsername('mara@okonkwo')).toBe(false);
    expect(isValidUsername('maré')).toBe(false);
  });

  it('rejects uppercase, so /author/Jane and /author/jane cannot diverge', () => {
    expect(isValidUsername('MaraOkonkwo')).toBe(false);
  });

  it('rejects handles that are too short or too long', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(65))).toBe(false);
    expect(isValidUsername('abc')).toBe(true);
  });

  it('rejects a leading hyphen or underscore', () => {
    expect(isValidUsername('-mara')).toBe(false);
    expect(isValidUsername('_mara')).toBe(false);
  });

  it('normalises case and surrounding whitespace before comparison', () => {
    expect(normaliseUsername('  MaraOkonkwo ')).toBe('maraokonkwo');
  });
});

describe('public profile projection', () => {
  it('withholds contact details when the author has not opted in', () => {
    const profile = toPublicProfile(anAuthor({ contactPublic: false }));

    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Mara Okonkwo');
    expect(profile!.quote).toBe('I take things apart.');
    // The point of the whole opt-in.
    expect(profile!.email).toBeNull();
    expect(profile!.telegram).toBeNull();
  });

  it('exposes contact details only when the author opted in', () => {
    const profile = toPublicProfile(anAuthor({ contactPublic: true }));

    expect(profile!.email).toBe('mara@example.test');
    expect(profile!.telegram).toBe('@mara');
  });

  it('defaults to withholding — an unset flag must never expose contact', () => {
    // Guards the direction of the default. If this inverts, every author
    // becomes publicly contactable without anyone deciding that.
    const profile = toPublicProfile(anAuthor({ contactPublic: false }));
    expect(profile!.email).toBeNull();
  });

  it('has no public profile without a username', () => {
    expect(toPublicProfile(anAuthor({ username: null }))).toBeNull();
  });

  it('still exposes the quote when contact is private', () => {
    // The quote is editorial, not contact information — it is not gated.
    const profile = toPublicProfile(anAuthor({ contactPublic: false }));
    expect(profile!.quote).toBe('I take things apart.');
  });
});
