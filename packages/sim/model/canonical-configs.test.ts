import { describe, expect, it } from 'vitest';
import { canonicalConfig, CANONICAL_CONFIGS } from './canonical-configs';

describe('canonicalConfig', () => {
  it('returns the named config', () => {
    expect(canonicalConfig('uniform')).toBe(CANONICAL_CONFIGS.uniform);
  });

  it('throws on an unknown name', () => {
    expect(() => canonicalConfig('nope' as never)).toThrow();
  });
});
