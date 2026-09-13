import { describe, it, expect } from 'vitest';
import { makeCategory, applyCategoryEdit, isRetired, orderFromIds } from './category';
import {
  EmptyCategoryNameError,
  InvalidCategoryOrderError,
  UnsluggableCategoryNameError,
} from './errors';
import { asCategoryId, asTenantId } from '@core/shared';

// Zero mocks — the payoff for keeping domain/ pure.
const ID = asCategoryId('018f-cat');
const TENANT = asTenantId('018f-tenant');

const make = (name: string, slug?: string, description?: string | null) =>
  makeCategory({ id: ID, tenantId: TENANT, name, slug, description, position: 0 });

describe('makeCategory', () => {
  it('derives the slug from the name', () => {
    expect(make('Hardware Reviews').slug).toBe('hardware-reviews');
  });

  it('prefers an explicit slug when given', () => {
    expect(make('Hardware Reviews', 'kit').slug).toBe('kit');
  });

  it('strips diacritics rather than dropping the word', () => {
    expect(make('Café Culture').slug).toBe('cafe-culture');
  });

  it('trims the name', () => {
    expect(make('  Esports  ').name).toBe('Esports');
  });

  it('refuses an empty name', () => {
    expect(() => make('   ')).toThrow(EmptyCategoryNameError);
  });

  it('refuses a name with nothing sluggable in it', () => {
    // Would otherwise produce the URL /category/ — a 404 nobody can diagnose.
    expect(() => make('!!! ???')).toThrow(UnsluggableCategoryNameError);
  });

  it('starts live', () => {
    expect(isRetired(make('News'))).toBe(false);
  });

  it('keeps the position it was given', () => {
    const c = makeCategory({ id: ID, tenantId: TENANT, name: 'News', position: 7 });
    expect(c.position).toBe(7);
  });

  it('trims the description', () => {
    expect(make('News', undefined, '  Daily headlines.  ').description).toBe('Daily headlines.');
  });

  it('stores a blank description as null, so "cleared" and "never set" are one state', () => {
    expect(make('News', undefined, '   ').description).toBeNull();
    expect(make('News').description).toBeNull();
  });
});

describe('applyCategoryEdit', () => {
  const base = make('News', undefined, 'Daily headlines.');

  it('leaves untouched fields alone', () => {
    const next = applyCategoryEdit(base, {});
    expect(next.name).toBe('News');
    expect(next.slug).toBe('news');
    expect(next.description).toBe('Daily headlines.');
    expect(next.position).toBe(0);
  });

  it('renames without moving the slug', () => {
    // A rename is cosmetic; the URL only changes when asked for explicitly.
    const next = applyCategoryEdit(base, { name: 'Latest News' });
    expect(next.name).toBe('Latest News');
    expect(next.slug).toBe('news');
  });

  it('slugifies an explicit slug change', () => {
    expect(applyCategoryEdit(base, { slug: 'Breaking News' }).slug).toBe('breaking-news');
  });

  it('refuses to clear the name', () => {
    expect(() => applyCategoryEdit(base, { name: '' })).toThrow(EmptyCategoryNameError);
  });

  it('refuses an unsluggable slug', () => {
    expect(() => applyCategoryEdit(base, { slug: '???' })).toThrow(UnsluggableCategoryNameError);
  });

  it('clears the description on null', () => {
    expect(applyCategoryEdit(base, { description: null }).description).toBeNull();
  });

  it('clears the description on whitespace', () => {
    expect(applyCategoryEdit(base, { description: '  ' }).description).toBeNull();
  });

  it('does not touch position — reordering is a separate operation', () => {
    const moved = { ...base, position: 4 };
    expect(applyCategoryEdit(moved, { name: 'Other' }).position).toBe(4);
  });
});

describe('orderFromIds', () => {
  const live = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as { id: ReturnType<typeof asCategoryId> }[];

  it('numbers the requested order from zero', () => {
    expect(orderFromIds(['c', 'a', 'b'], live)).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('refuses a partial order — a stale page would leave positions colliding', () => {
    expect(() => orderFromIds(['a', 'b'], live)).toThrow(InvalidCategoryOrderError);
  });

  it('refuses an id that is not live in this tenant', () => {
    // Covers another tenant's id and a retired one alike: neither is in `live`.
    expect(() => orderFromIds(['a', 'b', 'c', 'x'], live)).toThrow(InvalidCategoryOrderError);
  });

  it('refuses a duplicate even when the set is otherwise complete', () => {
    expect(() => orderFromIds(['a', 'b', 'c', 'a'], live)).toThrow(InvalidCategoryOrderError);
  });

  it('reports what was wrong, so the error is diagnosable', () => {
    try {
      orderFromIds(['a', 'a', 'x'], live);
      expect.unreachable();
    } catch (e) {
      expect((e as InvalidCategoryOrderError).details).toEqual({
        missing: ['b', 'c'],
        unknown: ['x'],
        duplicated: ['a'],
      });
    }
  });
});
