// Plan tree — static without a clock, or animated: given `rewrites` + `currentMs`, renders
// whichever rewrite has fired by that point, with the affected subtree cross-fading from
// `before` to `after` and a labelled annotation naming the rule and the concrete change.
// Wiring this to a *live* clock is SAS-062 (E7) — this component only proves the pure,
// controlled-by-currentMs contract: same currentMs in always produces the same tree out.
'use client';

import { usePrefersReducedMotion } from '@sas/ui';
import { useEffect, useRef, useState, type JSX } from 'react';
import { ChartFrame } from '../primitives';
import { PLAN_NODE_LABEL, computeTreeLayout, type PlanTreeNode, type TreeLayout } from './planLayout';
import { computeActiveRewrite, type PlanRewrite, type RewriteRule } from './planRewrites';
import styles from './PlanTree.module.css';

export type { PlanTreeNode, PlanNodeKind } from './planLayout';
export type { PlanRewrite, RewriteRule } from './planRewrites';

export interface PlanTreeProps {
  initial: PlanTreeNode;
  final: PlanTreeNode;
  rewrites: PlanRewrite[];
  /** Undefined renders `final` statically, with no animation. */
  currentMs?: number;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

const ANNOTATION_HEIGHT = 44;
const TRANSITION_MS = 220;

const RULE_LABEL: Record<RewriteRule, string> = {
  optimizeSkewedJoin: 'AQE: skew join optimization',
  coalesceShufflePartitions: 'AQE: coalesce shuffle partitions',
  dynamicJoinSelection: 'AQE: dynamic join selection',
};

function renderTree(tree: PlanTreeNode, layout: TreeLayout, className: string | undefined): JSX.Element {
  const nodes: JSX.Element[] = [];

  function walk(node: PlanTreeNode): void {
    const pos = layout.positions.get(node.id);
    if (pos) {
      nodes.push(
        <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
          <circle r={26} className={styles.node} />
          <text textAnchor="middle" dominantBaseline="middle" className={styles.nodeLabel}>
            {PLAN_NODE_LABEL[node.kind]}
          </text>
        </g>,
      );
    }
    node.children.forEach(walk);
  }
  walk(tree);

  return (
    <g className={className}>
      {layout.edges.map(([fromId, toId]) => {
        const from = layout.positions.get(fromId);
        const to = layout.positions.get(toId);
        if (!from || !to) return null;
        return <line key={`${fromId}-${toId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={styles.edge} />;
      })}
      {nodes}
    </g>
  );
}

export function PlanTree(props: PlanTreeProps): JSX.Element {
  const { initial, final, rewrites, currentMs, viewBoxWidth = 480, viewBoxHeight = 320 } = props;
  const reducedMotion = usePrefersReducedMotion();

  const activeRewrite = currentMs === undefined ? undefined : computeActiveRewrite(rewrites, currentMs);
  const steadyTree = currentMs === undefined ? final : activeRewrite ? activeRewrite.after : initial;

  const prevRewriteRef = useRef<PlanRewrite | undefined>(undefined);
  const [fadingOut, setFadingOut] = useState<PlanTreeNode | undefined>(undefined);

  useEffect(() => {
    const prev = prevRewriteRef.current;
    prevRewriteRef.current = activeRewrite;

    if (!activeRewrite || activeRewrite === prev || reducedMotion) return undefined;

    setFadingOut(prev ? prev.after : initial);
    const timer = setTimeout(() => setFadingOut(undefined), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [activeRewrite, initial, reducedMotion]);

  const treeHeight = viewBoxHeight - (activeRewrite ? ANNOTATION_HEIGHT : 0);
  const layout = computeTreeLayout(steadyTree, viewBoxWidth, treeHeight);
  const fadingLayout = fadingOut ? computeTreeLayout(fadingOut, viewBoxWidth, treeHeight) : undefined;

  const title = activeRewrite ? `Query plan after ${RULE_LABEL[activeRewrite.rule]}` : 'Query plan';

  return (
    <ChartFrame viewBoxWidth={viewBoxWidth} viewBoxHeight={viewBoxHeight} title={title} className={styles.tree}>
      {fadingOut && fadingLayout ? renderTree(fadingOut, fadingLayout, styles.exiting) : null}
      {renderTree(steadyTree, layout, fadingOut ? styles.entering : undefined)}
      {activeRewrite ? (
        <g>
          <text x={viewBoxWidth / 2} y={viewBoxHeight - 26} textAnchor="middle" className={styles.annotationRule}>
            {RULE_LABEL[activeRewrite.rule]}
          </text>
          <text x={viewBoxWidth / 2} y={viewBoxHeight - 10} textAnchor="middle" className={styles.annotationDescription}>
            {activeRewrite.description}
          </text>
        </g>
      ) : null}
    </ChartFrame>
  );
}
