// SAS-010 (stretch) — default RunConfig, matching the defaults documented inline in
// docs/SIMULATOR_SPEC.md §1.

import type { RunConfig } from '../types';

export const DEFAULT_RUN_CONFIG: RunConfig = {
  cluster: {
    executors: 8,
    coresPerExecutor: 4,
    executorMemoryMiB: 8192,
    memoryFraction: 0.6,
    storageFraction: 0.5,
  },
  sql: {
    shufflePartitions: 200,
    autoBroadcastJoinThresholdMiB: 10,
    adaptive: {
      enabled: true,
      advisoryPartitionSizeMiB: 64,
      coalescePartitions: true,
      skewJoinEnabled: true,
      skewedPartitionFactor: 5,
      skewedPartitionThresholdMiB: 256,
    },
  },
  data: {
    rows: 1_000_000,
    keyCardinality: 200,
    zipfAlpha: 0,
    nullFraction: 0,
    bytesPerRow: 128,
    saltFactor: 1,
  },
  query: {
    kind: 'join',
    joinType: 'inner',
    other: { rows: 265, bytesPerRow: 128 },
  },
};
