import { describe, expect, it } from 'vitest';
import { AQE_TOGGLE, defaultFor, KNOB_DEFAULTS, KNOB_DEFS } from './knobs';

describe('aqe knobs', () => {
  it('defaults match docs/modules/m2-aqe.md §3', () => {
    expect(KNOB_DEFAULTS).toEqual({ aqe: 1, adv: 64, skf: 5, est: 2 });
  });

  it('defaultFor looks up each knob, including the aqe toggle', () => {
    expect(defaultFor('adv')).toBe(64);
    expect(defaultFor('skf')).toBe(5);
    expect(defaultFor('est')).toBe(2);
    expect(defaultFor('aqe')).toBe(1);
  });

  it('defaultFor falls back to 0 for an unknown id', () => {
    expect(defaultFor('nope')).toBe(0);
  });

  it('the aqe toggle is excluded from the range-rendered KNOB_DEFS list', () => {
    expect(KNOB_DEFS.some((def) => def.id === AQE_TOGGLE.id)).toBe(false);
  });

  it('est is bounded to a -3..3 exponent range', () => {
    const est = KNOB_DEFS.find((def) => def.id === 'est');
    expect(est?.min).toBe(-3);
    expect(est?.max).toBe(3);
  });
});
