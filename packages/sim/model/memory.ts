// SAS-014 (this file, spill/GC stubbed) → SAS-018 (spill/GC replaced with the real model).
// See docs/SIMULATOR_SPEC.md §2 Step 4 ("Spill", "GC").

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

export interface SpillResult {
  memorySpilledBytes: Bytes;
  diskSpilledBytes: Bytes;
  spillPenaltyMs: SimMs;
  status: 'ok' | 'spilled' | 'oom';
}

/**
 * PLACEHOLDER (SAS-014): always reports zero spill and `'ok'`. Replaced with the real spill
 * model in SAS-018. Deliberately zero, not a plausible-looking nonzero number, so the stub is
 * unmistakable in review and in the SAS-018 diff.
 */
export function estimateSpill(_peakExecutionMemoryBytes: Bytes, _ceilingBytes: Bytes): SpillResult {
  return {
    memorySpilledBytes: asBytes(0),
    diskSpilledBytes: asBytes(0),
    spillPenaltyMs: asSimMs(0),
    status: 'ok',
  };
}

/**
 * PLACEHOLDER (SAS-014): always reports zero GC time. Replaced with the real GC model in
 * SAS-018.
 */
export function computeGcMs(_heapPressure: number): SimMs {
  return asSimMs(0);
}
