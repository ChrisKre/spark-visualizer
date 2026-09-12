// Hand-rolled recursive tree layout — no d3-hierarchy. Plan trees here are shallow (join
// trees, depth < 10, low branching), and d3-hierarchy isn't in ADR-0005's module allowlist
// (scale/shape/array/interpolate only), so a small recursive layout avoids both an unlisted
// dependency and an ADR amendment.
export type PlanNodeKind =
  | 'Scan'
  | 'Exchange'
  | 'BroadcastExchange'
  | 'Sort'
  | 'Aggregate'
  | 'Project'
  | 'BroadcastHashJoin'
  | 'ShuffledHashJoin'
  | 'SortMergeJoin';

export interface PlanTreeNode {
  id: number;
  kind: PlanNodeKind;
  children: PlanTreeNode[];
  stageId: number;
  estimatedSizeBytes?: number;
  actualSizeBytes?: number;
  partitionCount?: number;
}

export const PLAN_NODE_LABEL: Record<PlanNodeKind, string> = {
  Scan: 'Scan',
  Exchange: 'Exchange',
  BroadcastExchange: 'Broadcast Exchange',
  Sort: 'Sort',
  Aggregate: 'Aggregate',
  Project: 'Project',
  BroadcastHashJoin: 'Broadcast Hash Join',
  ShuffledHashJoin: 'Shuffled Hash Join',
  SortMergeJoin: 'Sort Merge Join',
};

export interface TreePosition {
  x: number;
  y: number;
}

export interface TreeLayout {
  positions: Map<number, TreePosition>;
  edges: Array<[number, number]>;
}

function maxDepth(node: PlanTreeNode, depth = 0): number {
  if (node.children.length === 0) return depth;
  return Math.max(...node.children.map((child) => maxDepth(child, depth + 1)));
}

/**
 * Top-down layout, root at y=0 (BACKLOG SAS-045: "SVG, laid out top-down"): leaves are given
 * sequential, evenly-spaced x slots left to right; each parent is centered over the mean x of
 * its children. Depth maps linearly to y across the available height.
 */
export function computeTreeLayout(root: PlanTreeNode, width: number, height: number): TreeLayout {
  const positions = new Map<number, TreePosition>();
  const edges: Array<[number, number]> = [];

  const depth = Math.max(1, maxDepth(root));
  const levelHeight = height / (depth + 1);
  let leafCount = 0;

  function countLeaves(node: PlanTreeNode): number {
    return node.children.length === 0 ? 1 : node.children.reduce((sum, child) => sum + countLeaves(child), 0);
  }
  const totalLeaves = Math.max(1, countLeaves(root));
  const leafWidth = width / totalLeaves;

  function place(node: PlanTreeNode, level: number): number {
    if (node.children.length === 0) {
      const x = (leafCount + 0.5) * leafWidth;
      leafCount += 1;
      positions.set(node.id, { x, y: level * levelHeight });
      return x;
    }

    const childXs = node.children.map((child) => {
      edges.push([node.id, child.id]);
      return place(child, level + 1);
    });
    const x = childXs.reduce((sum, cx) => sum + cx, 0) / childXs.length;
    positions.set(node.id, { x, y: level * levelHeight });
    return x;
  }

  place(root, 0);
  return { positions, edges };
}
