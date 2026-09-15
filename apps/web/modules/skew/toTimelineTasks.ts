// SAS-052 (E6) — RunResult.tasks -> the shape TaskTimeline (packages/viz/canvas) expects.
// TaskResult's fields are already named and shaped identically; this only widens the branded
// SimMs/Bytes numbers back to plain `number` (packages/viz has no @sas/sim dependency — see
// .dependency-cruiser.cjs's viz-only-imports-ui rule), which is a safe direction since every
// branded type is a `number` at runtime.
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
