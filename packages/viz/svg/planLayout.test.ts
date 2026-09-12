import { describe, expect, it } from 'vitest';
import { computeTreeLayout, type PlanTreeNode } from './planLayout';

// A small join tree: Aggregate -> SortMergeJoin -> [Sort -> Scan(A), Sort -> Scan(B)]
function sampleTree(): PlanTreeNode {
  return {
    id: 1,
    kind: 'Aggregate',
    stageId: 3,
    children: [
      {
        id: 2,
        kind: 'SortMergeJoin',
        stageId: 2,
        children: [
          { id: 3, kind: 'Sort', stageId: 1, children: [{ id: 4, kind: 'Scan', stageId: 0, children: [] }] },
          { id: 5, kind: 'Sort', stageId: 1, children: [{ id: 6, kind: 'Scan', stageId: 0, children: [] }] },
        ],
      },
    ],
  };
}

describe('computeTreeLayout', () => {
  it('positions every node exactly once', () => {
    const tree = sampleTree();
    const { positions } = computeTreeLayout(tree, 400, 300);
    expect(positions.size).toBe(6);
    for (const id of [1, 2, 3, 4, 5, 6]) {
      expect(positions.has(id)).toBe(true);
    }
  });

  it('records one edge per parent-child pair', () => {
    const { edges } = computeTreeLayout(sampleTree(), 400, 300);
    expect(edges).toHaveLength(5);
    expect(edges).toContainEqual([1, 2]);
    expect(edges).toContainEqual([2, 3]);
    expect(edges).toContainEqual([2, 5]);
  });

  it('does not overlap the two leaves at the same depth', () => {
    const { positions } = computeTreeLayout(sampleTree(), 400, 300);
    const scanA = positions.get(4)!;
    const scanB = positions.get(6)!;
    expect(scanA.y).toBe(scanB.y); // same depth
    expect(scanA.x).not.toBe(scanB.x);
  });

  it('places the root at y=0, top-down', () => {
    const { positions } = computeTreeLayout(sampleTree(), 400, 300);
    expect(positions.get(1)!.y).toBe(0);
  });

  it('centers a parent over the mean x of its children', () => {
    const { positions } = computeTreeLayout(sampleTree(), 400, 300);
    const join = positions.get(2)!;
    const sortA = positions.get(3)!;
    const sortB = positions.get(5)!;
    expect(join.x).toBeCloseTo((sortA.x + sortB.x) / 2, 5);
  });

  it('handles a single-node tree without dividing by zero', () => {
    const single: PlanTreeNode = { id: 1, kind: 'Scan', stageId: 0, children: [] };
    const { positions } = computeTreeLayout(single, 200, 100);
    expect(positions.get(1)).toEqual({ x: 100, y: 0 });
  });
});
