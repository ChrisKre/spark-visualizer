// SAS-052 (E6) — which StageResult the partition histogram shows. A RunResult can hold
// several stages (the fact-side shuffle write, the dimension-side shuffle write, the join's
// own reduce stage, ...) and there is no `stageKind` field to pick one by; what's stable and
// unambiguous is the stage whose `partitionBytes` has exactly `shufflePartitions` entries —
// docs/modules/m1-skew.md §4's "200 bars" is that stage by construction (the module's four
// knobs never change the reduce stage's own partition count). Falls back to the first stage
// if none match, so a malformed/edge-case run still renders something instead of a blank chart.
import type { RunResult, StageResult } from '@sas/sim';

export function pickHistogramStage(result: RunResult, shufflePartitions: number): StageResult | undefined {
  const candidates = result.stages.filter((stage) => stage.partitionBytes.length === shufflePartitions);
  if (candidates.length === 0) return result.stages[0];

  return candidates.reduce((best, stage) =>
    Math.max(...stage.partitionBytes) > Math.max(...best.partitionBytes) ? stage : best,
  );
}
