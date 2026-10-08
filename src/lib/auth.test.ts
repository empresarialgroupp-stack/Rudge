import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { __test } from './auth';

describe('sha256 fallback', () => {
  it('bate com a implementação nativa', () => {
    for (const s of ['', 'abc', 'andre485611', 'x'.repeat(200)]) {
      const expected = createHash('sha256').update(s).digest('hex');
      expect(__test.sha256Fallback(new TextEncoder().encode(s))).toBe(expected);
    }
  });
});
