import { describe, expect, it } from 'vitest';
import { createBandScale, createLinearScale } from './scales';

describe('createLinearScale', () => {
  it('wires domain and range', () => {
    const scale = createLinearScale([0, 100], [0, 400]);
    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(200);
    expect(scale(100)).toBe(400);
  });
});

describe('createBandScale', () => {
  it('spaces categories evenly across the range with the requested padding', () => {
    const scale = createBandScale(['a', 'b', 'c'], [0, 300], 0);
    expect(scale.bandwidth()).toBeCloseTo(100);
    expect(scale('a')).toBeCloseTo(0);
    expect(scale('b')).toBeCloseTo(100);
    expect(scale('c')).toBeCloseTo(200);
  });

  it('defaults to a nonzero inner padding', () => {
    const scale = createBandScale(['a', 'b'], [0, 200]);
    expect(scale.bandwidth()).toBeLessThan(100);
  });
});
