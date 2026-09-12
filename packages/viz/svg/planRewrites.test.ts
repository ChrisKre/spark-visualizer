import { describe, expect, it } from 'vitest';
import { computeActiveRewrite, type PlanRewrite } from './planRewrites';
import type { PlanTreeNode } from './planLayout';

const NODE: PlanTreeNode = { id: 1, kind: 'Scan', stageId: 0, children: [] };

function makeRewrite(overrides: Partial<PlanRewrite> = {}): PlanRewrite {
  return {
    rule: 'coalesceShufflePartitions',
    atMs: 1000,
    producingStageId: 1,
    description: 'coalesced 200 -> 17 partitions',
    before: NODE,
    after: NODE,
    ...overrides,
  };
}

describe('computeActiveRewrite', () => {
  it('returns undefined when no rewrite has fired yet', () => {
    const rewrites = [makeRewrite({ atMs: 1000 })];
    expect(computeActiveRewrite(rewrites, 500)).toBeUndefined();
  });

  it('is inclusive at the exact atMs boundary', () => {
    const rewrite = makeRewrite({ atMs: 1000 });
    expect(computeActiveRewrite([rewrite], 1000)).toBe(rewrite);
  });

  it('returns the most recent fired rewrite when several have fired', () => {
    const first = makeRewrite({ rule: 'optimizeSkewedJoin', atMs: 500 });
    const second = makeRewrite({ rule: 'coalesceShufflePartitions', atMs: 1000 });
    const third = makeRewrite({ rule: 'dynamicJoinSelection', atMs: 1500 });
    expect(computeActiveRewrite([first, second, third], 1200)).toBe(second);
    expect(computeActiveRewrite([first, second, third], 2000)).toBe(third);
  });

  it('does not assume sorted input', () => {
    const first = makeRewrite({ rule: 'optimizeSkewedJoin', atMs: 500 });
    const second = makeRewrite({ rule: 'coalesceShufflePartitions', atMs: 1000 });
    // Deliberately out of order.
    expect(computeActiveRewrite([second, first], 1200)).toBe(second);
  });

  it('returns undefined for an empty rewrite list', () => {
    expect(computeActiveRewrite([], 10_000)).toBeUndefined();
  });
});
