import { describe, expect, it } from 'vitest';
import { skewedKeys } from './skew';

const sumRows = (counts: Map<string, number>): number => Array.from(counts.values()).reduce((s, n) => s + n, 0);

describe('skewedKeys', () => {
  it('alpha=0 gives a near-uniform histogram', () => {
    const N = 50;
    const rows = 500_000;
    const { counts } = skewedKeys({ rows, keyCardinality: N, zipfAlpha: 0, nullFraction: 0, seed: 7 });
    const expected = rows / N;
    for (let k = 1; k <= N; k++) {
      const count = counts.get(String(k)) ?? 0;
      expect(count).toBeGreaterThan(expected * 0.85);
      expect(count).toBeLessThan(expected * 1.15);
    }
  });

  it('alpha=1.6 gives a top key holding 45-55% of rows', () => {
    const rows = 500_000;
    const { counts } = skewedKeys({ rows, keyCardinality: 50, zipfAlpha: 1.6, nullFraction: 0, seed: 7 });
    const share = (counts.get('1') ?? 0) / rows;
    expect(share).toBeGreaterThanOrEqual(0.45);
    expect(share).toBeLessThanOrEqual(0.55);
  });

  it('nullFraction assigns the expected row count to the null bucket', () => {
    const rows = 1_000_000;
    const { counts } = skewedKeys({ rows, keyCardinality: 200, zipfAlpha: 1.6, nullFraction: 0.03, seed: 7 });
    expect(counts.get('__null__')).toBe(Math.round(rows * 0.03));
  });

  it('conserves total rows across the histogram (within rounding)', () => {
    const rows = 1_000_000;
    const histogram = skewedKeys({ rows, keyCardinality: 200, zipfAlpha: 1.6, nullFraction: 0.03, seed: 7 });
    expect(sumRows(histogram.counts)).toBeGreaterThan(rows * 0.99);
    expect(sumRows(histogram.counts)).toBeLessThan(rows * 1.01);
  });

  it('is deterministic for the same seed and opts', () => {
    const opts = { rows: 200_000, keyCardinality: 200, zipfAlpha: 1.2, nullFraction: 0.01, seed: 42 };
    const a = skewedKeys(opts);
    const b = skewedKeys(opts);
    expect(a.counts).toEqual(b.counts);
  });

  it('saltFactor > 1 splits a hot key\'s rows across salted sub-key labels', () => {
    const opts = { rows: 500_000, keyCardinality: 50, zipfAlpha: 1.6, nullFraction: 0, seed: 7 };
    const unsalted = skewedKeys(opts);
    const salted = skewedKeys({ ...opts, saltFactor: 8 });

    const unsaltedTop = unsalted.counts.get('1') ?? 0;
    expect(salted.counts.has('1')).toBe(false);

    let saltedTopTotal = 0;
    for (let s = 0; s < 8; s++) saltedTopTotal += salted.counts.get(`1_${s}`) ?? 0;
    // Splitting redistributes the same rows across salted labels — total conserved, no bucket
    // is unreasonably far from an even 1/8th share.
    expect(saltedTopTotal).toBe(unsaltedTop);
    for (let s = 0; s < 8; s++) {
      expect(salted.counts.get(`1_${s}`) ?? 0).toBeGreaterThan((unsaltedTop / 8) * 0.9);
    }
  });

  it('salts the null bucket too, mirroring partition.ts\'s assignKeyRows', () => {
    const opts = { rows: 1_000_000, keyCardinality: 200, zipfAlpha: 0, nullFraction: 0.03, seed: 7, saltFactor: 4 };
    const { counts } = skewedKeys(opts);
    expect(counts.has('__null__')).toBe(false);
    let nullTotal = 0;
    for (let s = 0; s < 4; s++) nullTotal += counts.get(`__null___${s}`) ?? 0;
    expect(nullTotal).toBe(Math.round(opts.rows * opts.nullFraction));
  });
});
