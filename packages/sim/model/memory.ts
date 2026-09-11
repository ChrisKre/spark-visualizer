// SAS-014 (executionCeilingPerTask/storageFloorBytes) + SAS-018 (estimateSpill/computeGcMs).
// See docs/SIMULATOR_SPEC.md §2 Step 4 ("Spill", "GC").

import * as K from '../calibration/constants.generated';
import type { Bytes, RunConfig, SimMs } from '../types';
import { asBytes, asSimMs } from '../types';

const RESERVED_MEMORY_MIB = 300;
const BYTES_PER_MIB = 1024 * 1024;

/**
 * Execution memory available to one task, in bytes. Pure config arithmetic — no fitted
 * constants — so this is real from day one, unlike `estimateSpill`/`computeGcMs` below.
 * `liveStorageMiB` is always `0` in v1.0: no persistent caching is modelled yet, so nothing
 * occupies the storage region. See docs/SIMULATOR_SPEC.md §2 Step 4.
 */
export function executionCeilingPerTask(config: RunConfig, liveStorageMiB: number): Bytes {
  const usableMiB = config.cluster.executorMemoryMiB - RESERVED_MEMORY_MIB;
  const unifiedMiB = usableMiB * config.cluster.memoryFraction;
  const ceilingMiB = Math.max(0, (unifiedMiB - liveStorageMiB) / config.cluster.coresPerExecutor);
  return asBytes(ceilingMiB * BYTES_PER_MIB);
}

/** The floor execution may push storage down to, but never below — see `estimateSpill`. */
export function storageFloorBytes(config: RunConfig): Bytes {
  const usableMiB = config.cluster.executorMemoryMiB - RESERVED_MEMORY_MIB;
  const unifiedMiB = usableMiB * config.cluster.memoryFraction;
  return asBytes(Math.max(0, unifiedMiB * config.cluster.storageFraction) * BYTES_PER_MIB);
}

/**
 * How much of `requestedLiveStorageMiB` survives, given `executionDemandMiB` competing for the
 * same unified region. Execution may push storage down to the floor (`storageFloorBytes`) but
 * never further — storage can never take that floor away from execution, no matter how large
 * `requestedLiveStorageMiB` is. This is the M4 asymmetry; see docs/SIMULATOR_SPEC.md §2 Step 4.
 * (v1.0 has no caching module yet, so callers always pass `requestedLiveStorageMiB = 0` — this
 * function exists so the asymmetry itself is directly testable regardless.)
 */
export function evictStorage(config: RunConfig, requestedLiveStorageMiB: number, executionDemandMiB: number): number {
  const usableMiB = config.cluster.executorMemoryMiB - RESERVED_MEMORY_MIB;
  const unifiedMiB = usableMiB * config.cluster.memoryFraction;
  const floorMiB = unifiedMiB * config.cluster.storageFraction;
  const availableForStorage = Math.max(floorMiB, unifiedMiB - executionDemandMiB);
  return Math.max(0, Math.min(requestedLiveStorageMiB, availableForStorage));
}

export interface SpillResult {
  memorySpilledBytes: Bytes;
  diskSpilledBytes: Bytes;
  spillPenaltyMs: SimMs;
  status: 'ok' | 'spilled' | 'oom';
}

/**
 * SAS-018. `peakExecutionMemoryBytes <= ceilingBytes` spills nothing. Past that, the task
 * spills to disk (`serializationRatio` of the overflow) and pays a penalty for writing +
 * reading the spill plus a merge cost. Past `OOM_THRESHOLD_RATIO` × ceiling (post-spill), the
 * task genuinely fails — an unclamped, honest `'oom'` status, not a plausible-looking number.
 */
export function estimateSpill(peakExecutionMemoryBytes: Bytes, ceilingBytes: Bytes): SpillResult {
  if (peakExecutionMemoryBytes <= ceilingBytes) {
    return { memorySpilledBytes: asBytes(0), diskSpilledBytes: asBytes(0), spillPenaltyMs: asSimMs(0), status: 'ok' };
  }

  const spillBytes = peakExecutionMemoryBytes - ceilingBytes;
  const diskSpilledBytes = spillBytes * K.SERIALIZATION_RATIO;

  // How many extra merge passes the spilled runs need — proportional to how many times over
  // the ceiling the spill is. A documented simplification: the spec names `spillMergePasses`
  // without a formula for it.
  const spillMergePasses = ceilingBytes > 0 ? Math.max(1, Math.ceil(spillBytes / ceilingBytes)) : 1;

  const spillPenaltyMs =
    (spillBytes / BYTES_PER_MIB / K.SPILL_WRITE_THROUGHPUT_MBPS) * 1000 +
    (spillBytes / BYTES_PER_MIB / K.SPILL_READ_THROUGHPUT_MBPS) * 1000 +
    spillMergePasses * K.SPILL_MERGE_COST_MS;

  const postSpillPeak = ceilingBytes + diskSpilledBytes;
  const oomThresholdBytes = ceilingBytes * K.OOM_THRESHOLD_RATIO;
  const status: SpillResult['status'] = postSpillPeak > oomThresholdBytes ? 'oom' : 'spilled';

  return {
    memorySpilledBytes: asBytes(spillBytes),
    diskSpilledBytes: asBytes(diskSpilledBytes),
    spillPenaltyMs: asSimMs(spillPenaltyMs),
    status,
  };
}

/** `gcMs = heapPressure^2 * gcBaseMs`, `heapPressure` clamped to 1.4 by the caller. */
export function computeGcMs(heapPressure: number): SimMs {
  const clamped = Math.min(heapPressure, 1.4);
  return asSimMs(clamped * clamped * K.GC_BASE_MS);
}
