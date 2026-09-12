import type { PlanTreeNode } from './planLayout';

export type RewriteRule = 'optimizeSkewedJoin' | 'coalesceShufflePartitions' | 'dynamicJoinSelection';

export interface PlanRewrite {
  rule: RewriteRule;
  /** The producing stage's completion — never t=0 (SIMULATOR_SPEC). */
  atMs: number;
  producingStageId: number;
  /** Consumed verbatim — this is the exact text PlanTree's annotation shows. */
  description: string;
  before: PlanTreeNode;
  after: PlanTreeNode;
}

/**
 * The rewrite active at `currentMs`: the one with the greatest `atMs` that has already fired
 * (`atMs <= currentMs`, inclusive). Doesn't assume `rewrites` arrives sorted — picks by
 * comparing `atMs` directly rather than by array position, so out-of-order input still
 * resolves correctly.
 */
export function computeActiveRewrite(rewrites: PlanRewrite[], currentMs: number): PlanRewrite | undefined {
  let active: PlanRewrite | undefined;
  for (const rewrite of rewrites) {
    if (rewrite.atMs <= currentMs && (!active || rewrite.atMs > active.atMs)) {
      active = rewrite;
    }
  }
  return active;
}
