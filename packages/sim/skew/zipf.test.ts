import { describe, expect, it } from 'vitest';
import { mulberry32 } from './prng';
import { harmonicNumber, sampleZipfKeys, zipfPmf } from './zipf';

describe('zipf', () => {
  it('harmonicNumber(N, 0) equals N (every term is 1)', () => {
    expect(harmonicNumber(100, 0)).toBeCloseTo(100, 6);
  });

  it('alpha=0 gives a uniform histogram', () => {
    const rng = mulberry32(7);
    const N = 50;
    const samples = sampleZipfKeys(rng, N, 0, 100_000);
    const counts = new Array<number>(N + 1).fill(0);
    for (const k of samples) counts[k] += 1;
    const expected = samples.length / N;
    for (let k = 1; k <= N; k++) {
      expect(counts[k]).toBeGreaterThan(expected * 0.85);
      expect(counts[k]).toBeLessThan(expected * 1.15);
    }
  });

  it('alpha=1.6 gives a top key holding 45-55% of rows', () => {
    const rng = mulberry32(7);
    const N = 50;
    const sampleSize = 100_000;
    const samples = sampleZipfKeys(rng, N, 1.6, sampleSize);
    const topKeyCount = samples.filter((k) => k === 1).length;
    const share = topKeyCount / sampleSize;
    expect(share).toBeGreaterThanOrEqual(0.45);
    expect(share).toBeLessThanOrEqual(0.55);
  });

  it('same seed gives identical output across repeated draws', () => {
    const N = 50;
    const a = sampleZipfKeys(mulberry32(123), N, 1.2, 1000);
    const b = sampleZipfKeys(mulberry32(123), N, 1.2, 1000);
    expect(a).toEqual(b);
  });

  it('zipfPmf sums to ~1 over all keys', () => {
    const N = 20;
    const alpha = 1.1;
    const H = harmonicNumber(N, alpha);
    let sum = 0;
    for (let k = 1; k <= N; k++) sum += zipfPmf(k, alpha, H);
    expect(sum).toBeCloseTo(1, 6);
  });
});
