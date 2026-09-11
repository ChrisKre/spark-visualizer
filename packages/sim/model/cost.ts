// SAS-014 — task generation & the additive cost model. See docs/SIMULATOR_SPEC.md §2 Step 4.
//
// `fetchWaitMs` is deliberately absent from `TaskCost` — it depends on scheduling state (which
// tasks are concurrently fetching, over shared bandwidth) that a pure per-partition cost
// function cannot know. `packages/sim/model/scheduler.ts` computes it. The dimension ("other")
// side of a join never appears here either — see `packages/sim/plan/build.ts`'s file header.

import * as K from '../calibration/constants.generated';
import type { PartitionStats } from '../skew/partition';
import type { Bytes, PlanNode, RunConfig, SimMs } from '../types';
import { asBytes, asSimMs } from '../types';
import { computeGcMs, estimateSpill, executionCeilingPerTask } from './memory';

const BYTES_PER_MIB = 1024 * 1024;

// Deserialized row objects occupy more heap than their on-disk/serialized byte count; a sort
// additionally needs buffer space for the sort itself. Both are documented modelling
// simplifications, not fitted constants.
const DESERIALIZED_MEMORY_MULTIPLIER = 1.5;
const SORT_BUFFER_MULTIPLIER = 2.5;

export type TaskRole = 'map' | 'reduce';

export interface TaskCost {
  /** Every additive term except `fetchWaitMs` — see the file header. */
  baseMs: SimMs;
  inputBytes: Bytes;
  shuffleReadBytes: Bytes;
  shuffleWriteBytes: Bytes;
  gcMs: SimMs;
  memorySpilledBytes: Bytes;
  diskSpilledBytes: Bytes;
  peakExecutionMemoryBytes: Bytes;
  status: 'ok' | 'spilled' | 'oom';
}

function bytesToMs(bytes: number, throughputMBps: number): number {
  if (throughputMBps <= 0) return 0;
  return (bytes / BYTES_PER_MIB / throughputMBps) * 1000;
}

/**
 * The additive per-partition task cost. `role` selects which terms apply: a `'map'` task reads
 * the original input and writes shuffle output; a `'reduce'` task reads shuffle input (charged
 * by the scheduler as `fetchWaitMs`, not here) and may sort. A `BroadcastHashJoin` reduce node
 * charges no shuffle-read at all — the whole point of that rewrite/strategy is avoiding it.
 */
export function computeTaskCost(node: PlanNode, partition: PartitionStats, config: RunConfig, role: TaskRole): TaskCost {
  const rows = partition.rows;
  const inputBytes = partition.bytes;

  const deserializeMs = K.DESERIALIZE_MS_PER_TASK;
  const readMs = role === 'map' ? bytesToMs(inputBytes, K.READ_THROUGHPUT_MBPS) : 0;
  const computeMs = (rows * K.CPU_NS_PER_ROW) / 1e6;

  const involvesSort = node.kind === 'Sort' || node.kind === 'SortMergeJoin';
  const sortMs = role === 'reduce' && involvesSort && rows > 1 ? (rows * Math.log2(rows) * K.SORT_NS_PER_ROW_LOG) / 1e6 : 0;

  const shuffleWriteBytes = role === 'map' ? inputBytes : asBytes(0);
  const shuffleWriteMs = role === 'map' ? bytesToMs(shuffleWriteBytes, K.SHUFFLE_WRITE_THROUGHPUT_MBPS) : 0;

  const isBroadcastProbe = node.kind === 'BroadcastHashJoin';
  const shuffleReadBytes = role === 'reduce' && !isBroadcastProbe ? inputBytes : asBytes(0);

  const peakExecutionMemoryBytes = asBytes(
    inputBytes * (involvesSort ? SORT_BUFFER_MULTIPLIER : DESERIALIZED_MEMORY_MULTIPLIER)
  );
  // No persistent caching is modelled in v1.0 — liveStorageMiB is always 0. See
  // docs/SIMULATOR_SPEC.md §2 Step 4.
  const ceiling = executionCeilingPerTask(config, 0);
  const spill = estimateSpill(peakExecutionMemoryBytes, ceiling);
  const heapPressure = ceiling > 0 ? Math.min(peakExecutionMemoryBytes / ceiling, 1.4) : 1.4;
  const gcMs = computeGcMs(heapPressure);

  const baseMs = asSimMs(deserializeMs + readMs + computeMs + sortMs + shuffleWriteMs + spill.spillPenaltyMs + gcMs);

  return {
    baseMs,
    inputBytes,
    shuffleReadBytes,
    shuffleWriteBytes,
    gcMs: asSimMs(gcMs),
    memorySpilledBytes: spill.memorySpilledBytes,
    diskSpilledBytes: spill.diskSpilledBytes,
    peakExecutionMemoryBytes,
    status: spill.status,
  };
}
