// SAS-064 (E7) — RunResult.tasks -> the shape TaskTimeline (packages/viz/canvas) expects.
// Identical to skew/toTimelineTasks.ts (each module owns its own copy rather than
// cross-importing between module folders — see apps/web/modules/skew/toTimelineTasks.ts for
// why widening branded SimMs/Bytes back to plain `number` is safe here).
import type { TaskResult } from '@sas/sim';
import type { TimelineTask } from '@sas/viz';

export function toTimelineTasks(tasks: TaskResult[]): TimelineTask[] {
  return tasks.map((task) => ({
    taskId: task.taskId,
    stageId: task.stageId,
    slot: task.slot,
    partitionId: task.partitionId,
    launchMs: task.launchMs,
    finishMs: task.finishMs,
    shuffleReadBytes: task.shuffleReadBytes,
    memorySpilledBytes: task.memorySpilledBytes,
    diskSpilledBytes: task.diskSpilledBytes,
    status: task.status,
  }));
}
