// SAS-016 — metric rollup + warnings. See docs/SIMULATOR_SPEC.md §2 Step 6.

import type { RunMetrics, StageResult, TaskResult, Warning } from '../types';
import { asBytes, asSimMs } from '../types';

const EXCESSIVE_GC_PERCENT = 0.1;
const HIGH_SPILL_RATIO = 0.2;

function median(sortedAscending: number[]): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? ((sortedAscending[mid - 1] ?? 0) + (sortedAscending[mid] ?? 0)) / 2 : (sortedAscending[mid] ?? 0);
}

function sumBy(tasks: TaskResult[], select: (t: TaskResult) => number): number {
  return tasks.reduce((sum, t) => sum + select(t), 0);
}

export function rollupMetrics(stages: StageResult[], tasks: TaskResult[]): RunMetrics {
  const wallClockMs =
    stages.length > 0 ? Math.max(...stages.map((s) => s.finishMs)) - Math.min(...stages.map((s) => s.launchMs)) : 0;

  // CPU-seconds excludes fetchWaitMs — that is network wait, not compute. Preserving this
  // distinction is the M1 lesson: CPU-s stays flat while wall clock climbs under skew.
  const cpuMs = sumBy(tasks, (t) => t.finishMs - t.launchMs - t.fetchWaitMs);

  const taskDurations = tasks.map((t) => t.finishMs - t.launchMs).sort((a, b) => a - b);
  const maxTaskMs = taskDurations[taskDurations.length - 1] ?? 0;
  const medianTaskMs = median(taskDurations);
  const stragglerRatio = medianTaskMs > 0 ? maxTaskMs / medianTaskMs : 0;

  const totalTaskMs = sumBy(tasks, (t) => t.finishMs - t.launchMs) || 1;
  const gcMsTotal = sumBy(tasks, (t) => t.gcMs);

  return {
    wallClockMs: asSimMs(wallClockMs),
    cpuSeconds: cpuMs / 1000,
    stragglerRatio,
    shuffleReadBytes: asBytes(sumBy(tasks, (t) => t.shuffleReadBytes)),
    shuffleWriteBytes: asBytes(sumBy(tasks, (t) => t.shuffleWriteBytes)),
    diskSpilledBytes: asBytes(sumBy(tasks, (t) => t.diskSpilledBytes)),
    memorySpilledBytes: asBytes(sumBy(tasks, (t) => t.memorySpilledBytes)),
    gcMs: asSimMs(gcMsTotal),
    gcPercent: gcMsTotal / totalTaskMs,
    idleReducers: tasks.filter((t) => t.inputBytes === 0).length,
  };
}

export function collectWarnings(stages: StageResult[], metrics: RunMetrics): Warning[] {
  const warnings: Warning[] = [];

  for (const stage of stages) {
    if (stage.status === 'failed') {
      warnings.push({
        code: 'oom',
        stageId: stage.stageId,
        message: `Stage ${stage.stageId} failed: a task exceeded the OOM threshold.`,
      });
    }
  }

  if (metrics.gcPercent > EXCESSIVE_GC_PERCENT) {
    warnings.push({ code: 'excessive-gc', message: `GC consumed ${(metrics.gcPercent * 100).toFixed(1)}% of task time.` });
  }

  if (metrics.idleReducers > 0) {
    warnings.push({ code: 'idle-reducers', message: `${metrics.idleReducers} partition(s) received zero rows.` });
  }

  const totalShuffleBytes = metrics.shuffleWriteBytes || 1;
  if (metrics.diskSpilledBytes / totalShuffleBytes > HIGH_SPILL_RATIO) {
    warnings.push({ code: 'high-spill', message: 'A significant fraction of shuffle data spilled to disk.' });
  }

  return warnings;
}
