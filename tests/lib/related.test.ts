import { describe, expect, it } from 'vitest';
import { relatedPosts } from '../../src/lib/related';

const post = (id: string, tags: string[], category = 'web') => ({ id, data: { tags, category } });
const key = (tag: string) => tag.toLowerCase();

describe('relatedPosts', () => {
  const shape = post('shape', ['Web', 'GraphQL', 'Introspection']);
  const posts = [
    post('newer-web', ['Web', 'Cookie']),
    post('graphql', ['web', 'GraphQL']),
    post('crypto', ['RSA'], 'crypto'),
    shape,
    post('older-web', ['Web']),
  ];

  it('ranks rare shared tags above common ones, skips itself and posts without shared tags', () => {
    expect(relatedPosts(shape, posts, key).map((p) => p.id)).toEqual(['graphql', 'newer-web', 'older-web']);
  });

  it('respects the limit and returns nothing for a post without tags', () => {
    expect(relatedPosts(shape, posts, key, 1).map((p) => p.id)).toEqual(['graphql']);
    expect(relatedPosts(post('none', []), posts, key)).toEqual([]);
  });
});
