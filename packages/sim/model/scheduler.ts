// SAS-015 — slot-based discrete-event scheduler. See docs/SIMULATOR_SPEC.md §2 Step 5.

import type { SimMs, StageResult, TaskResult } from '../types';
import { asSimMs } from '../types';
import type { TaskCost } from './cost';

const BYTES_PER_MIB = 1024 * 1024;

export interface ScheduleStageResult {
  tasks: TaskResult[];
  stage: StageResult;
}

/**
 * FIFO within a stage: tasks are queued in partition order and assigned to the next free slot.
 * Stage wall clock is `max(finishMs) - min(launchMs)` — **never** the sum of task durations;
 * making that distinction visible is the primary teaching goal of the whole project.
 *
 * `fetchWaitMs` is modelled per reducer here (not in the cost model): a reducer cannot start
 * until this task is scheduled, and concurrent fetches share `networkBandwidthMBps` across
 * whatever else is fetching right now.
 */
export function scheduleStage(
  costs: TaskCost[],
  stageId: number,
  planNodeId: number,
  stageStartMs: SimMs,
  slots: number,
  networkBandwidthMBps: number,
  firstTaskId = 0
): ScheduleStageResult {
  const slotFreeAt = new Array<number>(Math.max(1, slots)).fill(stageStartMs);
  // Concurrent shuffle-fetch windows, so fetchWaitMs grows when more reducers fetch at once.
  const activeFetches: Array<{ endMs: number }> = [];

  const tasks: TaskResult[] = [];
  let launchMinMs: number = stageStartMs;
  let finishMaxMs: number = stageStartMs;

  costs.forEach((cost, partitionId) => {
    let slotIndex = 0;
    for (let i = 1; i < slotFreeAt.length; i++) {
      if ((slotFreeAt[i] ?? 0) < (slotFreeAt[slotIndex] ?? 0)) slotIndex = i;
    }
    const launchMs = Math.max(stageStartMs, slotFreeAt[slotIndex] ?? stageStartMs);

    // Drop fetches that have already finished by the time this task launches.
    for (let i = activeFetches.length - 1; i >= 0; i--) {
      if ((activeFetches[i]?.endMs ?? 0) <= launchMs) activeFetches.splice(i, 1);
    }

    let fetchWaitMs = 0;
    if (cost.shuffleReadBytes > 0 && networkBandwidthMBps > 0) {
      const concurrentFetches = 1 + activeFetches.length;
      const bandwidthShareMBps = networkBandwidthMBps / concurrentFetches;
      fetchWaitMs = (cost.shuffleReadBytes / BYTES_PER_MIB / bandwidthShareMBps) * 1000;
      activeFetches.push({ endMs: launchMs + fetchWaitMs });
    }

    const finishMs = launchMs + fetchWaitMs + cost.baseMs;
    slotFreeAt[slotIndex] = finishMs;

    launchMinMs = Math.min(launchMinMs, launchMs);
    finishMaxMs = Math.max(finishMaxMs, finishMs);

    tasks.push({
      taskId: firstTaskId + partitionId,
      stageId,
      slot: slotIndex,
      partitionId,
      launchMs: asSimMs(launchMs),
      finishMs: asSimMs(finishMs),
      inputBytes: cost.inputBytes,
      shuffleReadBytes: cost.shuffleReadBytes,
      shuffleWriteBytes: cost.shuffleWriteBytes,
      fetchWaitMs: asSimMs(fetchWaitMs),
      gcMs: cost.gcMs,
      memorySpilledBytes: cost.memorySpilledBytes,
      diskSpilledBytes: cost.diskSpilledBytes,
      peakExecutionMemoryBytes: cost.peakExecutionMemoryBytes,
      status: cost.status,
    });
  });

  const stage: StageResult = {
    stageId,
    planNodeId,
    taskIds: tasks.map((t) => t.taskId),
    launchMs: asSimMs(launchMinMs),
    finishMs: asSimMs(finishMaxMs),
    status: tasks.some((t) => t.status === 'oom') ? 'failed' : 'ok',
    partitionBytes: costs.map((c) => c.inputBytes),
  };

  return { tasks, stage };
}
