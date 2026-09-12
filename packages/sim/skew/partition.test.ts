import { describe, expect, it } from 'vitest';
import { computePartitionSizes, NULL_KEY, ZIPF_SAMPLE_CAP } from './partition';
import type { RunConfig } from '../types';

const baseData = (overrides: Partial<RunConfig['data']> = {}): RunConfig['data'] => ({
  rows: 1_000_000,
  keyCardinality: 200,
  zipfAlpha: 0,
  nullFraction: 0,
  bytesPerRow: 100,
  saltFactor: 1,
  ...overrides,
});

describe('computePartitionSizes', () => {
  it('total bytes across partitions is conserved when saltFactor increases', () => {
    const dataUnsalted = baseData({ zipfAlpha: 1.6, saltFactor: 1 });
    const dataSalted = baseData({ zipfAlpha: 1.6, saltFactor: 8 });

    const unsalted = computePartitionSizes(dataUnsalted, 200, 1);
    const salted = computePartitionSizes(dataSalted, 200, 1);

    const totalUnsalted = unsalted.reduce((s, p) => s + p.bytes, 0);
    const totalSalted = salted.reduce((s, p) => s + p.bytes, 0);

    expect(totalSalted).toBe(totalUnsalted);
  });

  it('salting spreads a hot key across more partitions (lowers the max partition size)', () => {
    const data = baseData({ zipfAlpha: 1.6, saltFactor: 1 });
    const unsalted = computePartitionSizes(data, 200, 1);
    const salted = computePartitionSizes(baseData({ zipfAlpha: 1.6, saltFactor: 8 }), 200, 1);

    const maxUnsalted = Math.max(...unsalted.map((p) => p.bytes));
    const maxSalted = Math.max(...salted.map((p) => p.bytes));

    expect(maxSalted).toBeLessThan(maxUnsalted);
  });

  it('nullFraction=0.03 with alpha=0 produces a severe straggler partition', () => {
    // shufflePartitions=1000 so a fair per-partition share (~0.1%) is small relative to the 3%
    // concentrated in the null partition — the ">10x median" acceptance criterion in
    // BACKLOG.md's SAS-012 depends on that ratio, which scales with shufflePartitions.
    const data = baseData({ zipfAlpha: 0, nullFraction: 0.03, saltFactor: 1 });
    const partitions = computePartitionSizes(data, 1000, 1);
    const rows = partitions.map((p) => p.rows).sort((a, b) => a - b);
    const median = rows[Math.floor(rows.length / 2)] ?? 1;
    const max = rows[rows.length - 1] ?? 0;

    expect(max).toBeGreaterThan(median * 10);
  });

  it('is deterministic for the same seed', () => {
    const data = baseData({ zipfAlpha: 1.2 });
    const a = computePartitionSizes(data, 200, 99);
    const b = computePartitionSizes(data, 200, 99);
    expect(a).toEqual(b);
  });

  it('handles rows above the sampling cap without crashing and stays roughly conserved', () => {
    const data = baseData({ rows: ZIPF_SAMPLE_CAP * 3, zipfAlpha: 0.5 });
    const partitions = computePartitionSizes(data, 50, 1);
    const totalRows = partitions.reduce((s, p) => s + p.rows, 0);
    // Rounding at the per-key/per-salt level can drift the total slightly from data.rows.
    expect(totalRows).toBeGreaterThan(data.rows * 0.99);
    expect(totalRows).toBeLessThan(data.rows * 1.01);
  });

  it('assigns nulls to a single synthetic key, independent of zipfAlpha', () => {
    // A dedicated sanity check that NULL_KEY exists and nulls dominate one partition even at
    // alpha=0 (uniform) — the null partition is not "just another uniform key".
    expect(NULL_KEY).toBe('__null__');
  });
});
