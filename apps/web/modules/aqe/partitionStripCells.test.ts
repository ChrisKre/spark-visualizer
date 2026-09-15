import { simulate } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { buildRunConfig } from './buildRunConfig';
import { deriveAfterPartitionBytes } from './partitionStripCells';
import { KNOB_DEFAULTS } from './knobs';

describe('deriveAfterPartitionBytes', () => {
  it('returns the original array unchanged when no rewrite fired (aqe off)', () => {
    const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, aqe: 0 }), 42);
    const stage0Bytes = result.stages[0]?.partitionBytes ?? [];
    expect(deriveAfterPartitionBytes(stage0Bytes, result.plan.rewrites)).toEqual(stage0Bytes);
  });

  it('conserves total bytes exactly under a coalesce-only rewrite', () => {
    const result = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
    expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['coalesceShufflePartitions']);

    const stage0Bytes = result.stages[0]?.partitionBytes ?? [];
    const after = deriveAfterPartitionBytes(stage0Bytes, result.plan.rewrites);

    const totalBefore = stage0Bytes.reduce((sum, b) => sum + b, 0);
    const totalAfter = after.reduce((sum, b) => sum + b, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it('matches the real reduce-stage partition count when only coalesce/skew fire (no dynamicJoinSelection)', () => {
    const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, skf: 2 }), 42);
    expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['optimizeSkewedJoin', 'coalesceShufflePartitions']);

    const stage0Bytes = result.stages[0]?.partitionBytes ?? [];
    const after = deriveAfterPartitionBytes(stage0Bytes, result.plan.rewrites);

    // Guards against a regression to a naive two-step (split-then-coalesce) transform: the real
    // simulator's reconcilePartitions regroups the ORIGINAL partitions straight to the coalesce
    // rule's own final target count in one step, and that's what stages[1] actually contains.
    expect(after.length).toBe((result.stages[1]?.partitionBytes ?? []).length);
  });

  it('still reflects the coalesce even when dynamicJoinSelection ALSO fires and reverts stages[1] to the original count', () => {
    const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, est: 3 }), 42);
    expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['coalesceShufflePartitions', 'dynamicJoinSelection']);

    const stage0Bytes = result.stages[0]?.partitionBytes ?? [];
    // The known quirk this module works around: stages[1] silently reverts to the original
    // (pre-rewrite) partition count once dynamicJoinSelection also fires.
    expect((result.stages[1]?.partitionBytes ?? []).length).toBe(stage0Bytes.length);

    // deriveAfterPartitionBytes must NOT revert — it should still show a real reduction,
    // matching what the plan tree's own annotation says happened, and conserve total bytes
    // exactly (grouping by count can undershoot the exact target via groupSize rounding — the
    // same characteristic packages/sim/model/run.ts's own coalesce() has — so the assertion
    // here is "fewer partitions and no bytes lost," not an exact count match).
    const after = deriveAfterPartitionBytes(stage0Bytes, result.plan.rewrites);
    expect(after.length).toBeLessThan(stage0Bytes.length);
    expect(after.reduce((sum, b) => sum + b, 0)).toBe(stage0Bytes.reduce((sum, b) => sum + b, 0));
  });
});
