// SAS-063 (E7) — re-derives the "after" partition-strip cells from stage 0's raw (always
// correct, pre-rewrite) partitionBytes, rather than reading `stages[1].partitionBytes`
// directly.
//
// Why: packages/sim/model/run.ts's `reconcilePartitions` re-derives the reduce stage's
// partition stats by reading `partitionCount` off the FINAL plan's map-side node. When
// `dynamicJoinSelection` also fires in the same run, it replaces the whole plan root with a
// fresh `BroadcastHashJoin` whose fact-side child is the original `Scan` — no `Exchange`
// survives, so there's no `partitionCount` left to read, and `reconcilePartitions` silently
// falls back to the ORIGINAL, un-rewritten partition count. `stages[1].partitionBytes` would
// then show "nothing happened" even though the plan tree correctly shows a coalesce/skew-split
// annotation having fired. Deriving straight from each rewrite's own `after.partitionCount` —
// which is unaffected by a later, unrelated join-switch rewrite — keeps the strip's cell
// counts always agreeing with what the plan tree itself displays.
//
// The transform mirrors packages/sim/model/run.ts's own reconcilePartitions/coalesce()/split()
// (not imported — internal to that module, not part of the @sas/sim barrel): a SINGLE regroup
// of the original partition array straight to the final target count, not two sequential
// transforms — the fixed rule order (skew-split, then coalesce) means coalesce's own
// `after.partitionCount` already IS that final target whenever it fires.
import type { AqeRewrite } from '@sas/sim';

/** Merges adjacent partitions into `targetCount` groups, summing their bytes exactly. */
function coalesce(bytes: number[], targetCount: number): number[] {
  if (targetCount <= 0 || targetCount >= bytes.length) return bytes;
  const groupSize = Math.ceil(bytes.length / targetCount);
  const groups: number[] = [];
  for (let i = 0; i < bytes.length; i += groupSize) {
    groups.push(bytes.slice(i, i + groupSize).reduce((sum, b) => sum + b, 0));
  }
  return groups;
}

/** Splits only the single largest partition into `targetCount - bytes.length + 1` equal
 *  sub-partitions, leaving every other partition untouched. */
function split(bytes: number[], targetCount: number): number[] {
  if (targetCount <= bytes.length || bytes.length === 0) return bytes;
  const largestIndex = bytes.reduce((best, value, i) => (value > (bytes[best] ?? -Infinity) ? i : best), 0);
  const largest = bytes[largestIndex] ?? 0;
  const others = bytes.filter((_, i) => i !== largestIndex);
  const subCount = targetCount - others.length;

  const subBytes = Math.floor(largest / subCount);
  const subParts = Array.from({ length: subCount }, (_, i) =>
    i === subCount - 1 ? largest - subBytes * (subCount - 1) : subBytes,
  );

  return [...others, ...subParts];
}

/**
 * Re-derives the "after" cell array from stage 0's raw partitionBytes. Whichever of
 * optimizeSkewedJoin/coalesceShufflePartitions fired LAST (fixed order: skew-split, then
 * coalesce) determines the final target count — matches the plan tree's own final Exchange
 * node exactly. dynamicJoinSelection is irrelevant here: it changes the join strategy, not the
 * shuffle partition count.
 */
export function deriveAfterPartitionBytes(stage0Bytes: number[], rewrites: AqeRewrite[]): number[] {
  const coalesceRewrite = rewrites.find((r) => r.rule === 'coalesceShufflePartitions');
  const skewRewrite = rewrites.find((r) => r.rule === 'optimizeSkewedJoin');
  const targetCount = coalesceRewrite?.after.partitionCount ?? skewRewrite?.after.partitionCount ?? stage0Bytes.length;

  if (targetCount === stage0Bytes.length) return stage0Bytes;
  return targetCount < stage0Bytes.length ? coalesce(stage0Bytes, targetCount) : split(stage0Bytes, targetCount);
}
