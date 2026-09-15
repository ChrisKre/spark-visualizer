import { describe, expect, it } from 'vitest';
import { isNullTrapActive, NULL_TRAP_PRESET_KNOBS } from './nullTrapPreset';
import { KNOB_DEFAULTS } from './knobs';

describe('NULL_TRAP_PRESET_KNOBS', () => {
  it('is a=0, nulls=0.03, salt=1 (docs/modules/m1-skew.md §6)', () => {
    expect(NULL_TRAP_PRESET_KNOBS).toEqual({ a: 0, nulls: 0.03, salt: 1 });
  });
});

describe('isNullTrapActive', () => {
  it('is false for the module defaults (skewed, no nulls)', () => {
    expect(isNullTrapActive(KNOB_DEFAULTS)).toBe(false);
  });

  it('is true once the preset knobs are applied', () => {
    expect(isNullTrapActive({ ...KNOB_DEFAULTS, ...NULL_TRAP_PRESET_KNOBS })).toBe(true);
  });

  it('is true for any uniform (a=0) config with a positive null fraction, not just the exact preset', () => {
    expect(isNullTrapActive({ ...KNOB_DEFAULTS, a: 0, nulls: 0.1, salt: 8 })).toBe(true);
  });

  it('is false when a is nonzero, even with nulls set', () => {
    expect(isNullTrapActive({ ...KNOB_DEFAULTS, a: 0.5, nulls: 0.03 })).toBe(false);
  });

  it('is false when nulls is zero, even with a=0', () => {
    expect(isNullTrapActive({ ...KNOB_DEFAULTS, a: 0, nulls: 0 })).toBe(false);
  });
});
