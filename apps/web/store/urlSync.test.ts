import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeParamsToState, encodeStateToParams } from './urlSync';

const DEFAULTS = { a: 0, salt: 1, nulls: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decodeParamsToState', () => {
  it('applies a known knob over the defaults', () => {
    const decoded = decodeParamsToState(new URLSearchParams('a=1.6&salt=8'), DEFAULTS);
    expect(decoded.knobs).toEqual({ a: 1.6, salt: 8, nulls: 0 });
  });

  it('warns and drops an unknown key without touching the known knobs', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decoded = decodeParamsToState(new URLSearchParams('a=1.6&bogus=1'), DEFAULTS);
    expect(decoded.knobs).toEqual({ ...DEFAULTS, a: 1.6 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bogus'));
  });

  it('warns and drops a non-numeric value for a known key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decoded = decodeParamsToState(new URLSearchParams('a=not-a-number'), DEFAULTS);
    expect(decoded.knobs.a).toBe(DEFAULTS.a);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a'));
  });

  it('reads cmp and t, clamping t to [0, 1]', () => {
    expect(decodeParamsToState(new URLSearchParams(''), DEFAULTS)).toMatchObject({ compare: false, tFraction: 0 });
    expect(decodeParamsToState(new URLSearchParams('cmp=1'), DEFAULTS)).toMatchObject({ compare: true });
    expect(decodeParamsToState(new URLSearchParams('t=0.5'), DEFAULTS)).toMatchObject({ tFraction: 0.5 });
    expect(decodeParamsToState(new URLSearchParams('t=5'), DEFAULTS)).toMatchObject({ tFraction: 1 });
    expect(decodeParamsToState(new URLSearchParams('t=-5'), DEFAULTS)).toMatchObject({ tFraction: 0 });
  });
});

describe('encodeStateToParams', () => {
  it('omits knobs equal to the default and includes ones that differ', () => {
    const params = encodeStateToParams({ a: 1.6, salt: 1, nulls: 0 }, DEFAULTS, false, 0);
    expect(params.get('a')).toBe('1.6');
    expect(params.has('salt')).toBe(false);
    expect(params.has('nulls')).toBe(false);
  });

  it('includes cmp only when true', () => {
    expect(encodeStateToParams(DEFAULTS, DEFAULTS, false, 0).has('cmp')).toBe(false);
    expect(encodeStateToParams(DEFAULTS, DEFAULTS, true, 0).get('cmp')).toBe('1');
  });

  it('includes t only when > 0', () => {
    expect(encodeStateToParams(DEFAULTS, DEFAULTS, false, 0).has('t')).toBe(false);
    expect(encodeStateToParams(DEFAULTS, DEFAULTS, false, 0.5).get('t')).toBe('0.5000');
  });

  it('round-trips through decodeParamsToState', () => {
    const knobs = { a: 1.6, salt: 8, nulls: 0.03 };
    const params = encodeStateToParams(knobs, DEFAULTS, true, 0.42);
    const decoded = decodeParamsToState(params, DEFAULTS);
    expect(decoded.knobs).toEqual(knobs);
    expect(decoded.compare).toBe(true);
    expect(decoded.tFraction).toBeCloseTo(0.42, 3);
  });
});
