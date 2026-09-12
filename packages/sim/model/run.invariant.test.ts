// SAS-019 — invariant tests. See docs/SIMULATOR_SPEC.md §5.

import { describe, expect, it } from 'vitest';
import { CANONICAL_CONFIGS, canonicalConfig } from './canonical-configs';
import { testConfig } from './test-helpers';
import { simulate } from './simulate';

const shuffledJoinQuery = canonicalConfig('hero-before').query;

describe('invariant: bytes conserved under salting', () => {
  it('total shuffle-write bytes at saltFactor=1 equals saltFactor=8 for the same data', () => {
    const unsalted = simulate(canonicalConfig('hero-before'), 1); // saltFactor 1
    const salted = simulate(canonicalConfig('hero-after'), 1); // saltFactor 8, same alpha/rows

    const totalUnsalted = unsalted.tasks
      .filter((t) => t.stageId === 0)
      .reduce((sum, t) => sum + t.shuffleWriteBytes, 0);
    const totalSalted = salted.tasks.filter((t) => t.stageId === 0).reduce((sum, t) => sum + t.shuffleWriteBytes, 0);

    expect(totalSalted).toBe(totalUnsalted);
  });
});

describe('invariant: wall clock >= max single task duration', () => {
  it.each(Object.entries(CANONICAL_CONFIGS))('%s', (_name, config) => {
    const result = simulate(config, 1);
    const maxTaskDuration = Math.max(...result.tasks.map((t) => t.finishMs - t.launchMs));
    expect(result.metrics.wallClockMs).toBeGreaterThanOrEqual(maxTaskDuration);
  });
});

describe('invariant: coalescing never increases partition count', () => {
  it('a coalesce rewrite always reduces the map-side Exchange partitionCount', () => {
    const result = simulate(canonicalConfig('aqe-coalesce-only'), 1);
    const coalesce = result.plan.rewrites.find((r) => r.rule === 'coalesceShufflePartitions');
    expect(coalesce).toBeDefined();
    const before = coalesce?.before.partitionCount ?? 0;
    const after = coalesce?.after.partitionCount ?? 0;
    expect(after).toBeLessThan(before);
  });

  it('final plan never has more shuffle partitions than the initial plan, across all 12 configs', () => {
    for (const config of Object.values(CANONICAL_CONFIGS)) {
      const result = simulate(config, 1);
      const initialExchange = findFirstExchange(result.plan.initial);
      const finalExchange = findFirstExchange(result.plan.final);
      const coalesceOnly = result.plan.rewrites.every((r) => r.rule !== 'optimizeSkewedJoin');
      if (coalesceOnly) {
        expect(finalExchange?.partitionCount ?? 0).toBeLessThanOrEqual(initialExchange?.partitionCount ?? 0);
      }
    }
  });
});

describe('invariant: a genuinely low-memory config produces a real oom status, not a clamped number', () => {
  it('reports status "oom" on at least one task, with an unclamped memorySpilledBytes', () => {
    const lowMemoryConfig = testConfig({
      query: shuffledJoinQuery,
      cluster: { executorMemoryMiB: 600, coresPerExecutor: 8 }, // tiny ceiling per task
      data: { rows: 5_000_000, keyCardinality: 5, zipfAlpha: 1.8, bytesPerRow: 2000, nullFraction: 0, saltFactor: 1 },
      sql: { shufflePartitions: 20, adaptive: { enabled: false } },
    });
    const result = simulate(lowMemoryConfig, 1);
    const oomTasks = result.tasks.filter((t) => t.status === 'oom');
    expect(oomTasks.length).toBeGreaterThan(0);
    expect(oomTasks[0]?.memorySpilledBytes).toBeGreaterThan(0);
    expect(result.stages.some((s) => s.status === 'failed')).toBe(true);
    expect(result.warnings.some((w) => w.code === 'oom')).toBe(true);
  });
});

function findFirstExchange(node: { kind: string; partitionCount?: number; children: unknown[] }): { partitionCount?: number } | undefined {
  if (node.kind === 'Exchange') return node;
  for (const child of node.children as Array<Parameters<typeof findFirstExchange>[0]>) {
    const found = findFirstExchange(child);
    if (found) return found;
  }
  return undefined;
}
