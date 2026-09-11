import { describe, expect, it } from 'vitest';
import { murmur32, nonNegativeMod, saltKey } from './hash';

describe('murmur32', () => {
  it('is deterministic for the same (key, seed)', () => {
    expect(murmur32('hello', 1)).toBe(murmur32('hello', 1));
  });

  it('is sensitive to the seed', () => {
    expect(murmur32('hello', 1)).not.toBe(murmur32('hello', 2));
  });

  it('always returns a non-negative 32-bit integer', () => {
    for (const key of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', '__null__', 'key_1234']) {
      const h = murmur32(key, 0);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('nonNegativeMod', () => {
  it('matches % for positive n', () => {
    expect(nonNegativeMod(7, 3)).toBe(1);
  });

  it('is always non-negative, unlike raw %', () => {
    expect(nonNegativeMod(-1, 5)).toBe(4);
    expect(-1 % 5).toBe(-1);
  });
});

describe('saltKey', () => {
  it('is a no-op when saltFactor <= 1', () => {
    expect(saltKey('k', 3, 1)).toBe('k');
    expect(saltKey('k', 3, 0)).toBe('k');
  });

  it('appends the sub-index when saltFactor > 1', () => {
    expect(saltKey('k', 2, 8)).toBe('k_2');
  });
});
