import { describe, it, expect } from 'vitest';
import { hasReadiness, missingToPublishFrom } from './readiness';

describe('missingToPublishFrom', () => {
  it('lists what blocks publishing, blank counting as missing', () => {
    expect(missingToPublishFrom({ excerpt: 'Yes', coverImage: 'http://x/c.jpg' })).toEqual([]);
    expect(missingToPublishFrom({ excerpt: '', coverImage: null })).toEqual(['excerpt', 'coverImage']);
    expect(missingToPublishFrom({ excerpt: undefined, coverImage: 'http://x/c.jpg' })).toEqual(['excerpt']);
  });
});

describe('hasReadiness', () => {
  const both = { excerpt: null, coverImage: null };

  it('treats the blockers as overlapping — a draft missing both needs both', () => {
    expect(hasReadiness(both, 'needs-excerpt')).toBe(true);
    expect(hasReadiness(both, 'needs-cover')).toBe(true);
    expect(hasReadiness(both, 'ready')).toBe(false);
  });

  it('is ready only with nothing missing', () => {
    expect(hasReadiness({ excerpt: 'Yes', coverImage: 'http://x/c.jpg' }, 'ready')).toBe(true);
  });
});
