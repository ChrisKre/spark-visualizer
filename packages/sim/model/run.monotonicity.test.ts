// SAS-019 — monotonicity tests. See docs/SIMULATOR_SPEC.md §5.

import { describe, expect, it } from 'vitest';
import { testConfig } from './test-helpers';
import { simulate } from './simulate';

const shuffledJoinQuery = { kind: 'join' as const, joinType: 'inner' as const, other: { rows: 2_000_000, bytesPerRow: 128 } };

describe('monotonicity: increasing zipfAlpha never decreases stragglerRatio', () => {
  it('holds across [0, 0.5, 1.0, 1.6, 2.2]', () => {
    const alphas = [0, 0.5, 1.0, 1.6, 2.2];
    const ratios = alphas.map((zipfAlpha) => {
      const config = testConfig({
        query: shuffledJoinQuery,
        data: { rows: 2_000_000, keyCardinality: 200, bytesPerRow: 2000, zipfAlpha, nullFraction: 0, saltFactor: 1 },
        sql: { adaptive: { enabled: false } }, // isolate the skew effect from AQE's own partition changes
      });
      return simulate(config, 1).metrics.stragglerRatio;
    });

    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1] ?? 0);
    }
  });
});

describe('monotonicity: increasing executorMemoryMiB never increases diskSpilledBytes', () => {
  it('holds across [2048, 4096, 8192, 16384]', () => {
    const memories = [2048, 4096, 8192, 16384];
    const spills = memories.map((executorMemoryMiB) => {
      const config = testConfig({
        query: shuffledJoinQuery,
        cluster: { executorMemoryMiB, coresPerExecutor: 4 },
        data: { rows: 5_000_000, keyCardinality: 50, bytesPerRow: 2000, zipfAlpha: 1.8, nullFraction: 0, saltFactor: 1 },
        sql: { shufflePartitions: 20, adaptive: { enabled: false } },
      });
      return simulate(config, 1).metrics.diskSpilledBytes;
    });

    for (let i = 1; i < spills.length; i++) {
      expect(spills[i]).toBeLessThanOrEqual(spills[i - 1] ?? Infinity);
    }
  });
});
