// SAS-012 — partition sizing: nulls handled first, Zipf-sampled keys, salting, hashing into
// shuffle partitions. See docs/SIMULATOR_SPEC.md §2 Step 1.

import type { Bytes, RunConfig } from '../types';
import { asBytes } from '../types';
import { murmur32, nonNegativeMod, saltKey } from './hash';
import { mulberry32 } from './prng';
import { sampleZipfKeys } from './zipf';

/**
 * Individual inverse-transform draws are capped at this many, regardless of `data.rows` — a
 * performance choice, not a fitted calibration constant. See docs/SIMULATOR_SPEC.md §2 Step 1
 * ("Implementation note — sampling cap").
 */
export const ZIPF_SAMPLE_CAP = 200_000;

/** The single synthetic key every null row is assigned to — mirrors Spark's `HashPartitioner`
 * sending every null to the same reducer. */
export const NULL_KEY = '__null__';

export interface PartitionStats {
  rows: number;
  bytes: Bytes;
}

interface Accumulator {
  rows: number;
}

/**
 * Computes each shuffle partition's row/byte totals for `data`, given `shufflePartitions` and a
 * seed. Nulls are assigned first (a single synthetic key), then the remaining rows are Zipf-
 * sampled over `keyCardinality` keys, salted if `saltFactor > 1`, and hashed into partitions.
 *
 * **Invariant:** the total bytes returned is the same regardless of `saltFactor` — salting only
 * redistributes an already-fixed per-key row count across more partitions, it never changes that
 * count. See `partition.test.ts`.
 */
export function computePartitionSizes(
  data: RunConfig['data'],
  shufflePartitions: number,
  seed: number
): PartitionStats[] {
  const partitions: Accumulator[] = Array.from({ length: Math.max(1, shufflePartitions) }, () => ({ rows: 0 }));
  const rng = mulberry32(seed);

  const nullRows = Math.round(data.rows * data.nullFraction);
  const remainingRows = data.rows - nullRows;

  if (nullRows > 0) {
    assignKeyRows(partitions, NULL_KEY, nullRows, data.saltFactor, shufflePartitions);
  }

  if (remainingRows > 0 && data.keyCardinality > 0) {
    const sampleSize = Math.max(1, Math.min(remainingRows, ZIPF_SAMPLE_CAP));
    const sampledKeys = sampleZipfKeys(rng, data.keyCardinality, data.zipfAlpha, sampleSize);

    const sampleCounts = new Map<number, number>();
    for (const key of sampledKeys) {
      sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1);
    }

    const scale = remainingRows / sampleSize;
    for (const [key, sampleCount] of sampleCounts) {
      const rows = Math.round(sampleCount * scale);
      if (rows <= 0) continue;
      assignKeyRows(partitions, String(key), rows, data.saltFactor, shufflePartitions);
    }
  }

  return partitions.map((p) => ({ rows: p.rows, bytes: asBytes(p.rows * data.bytesPerRow) }));
}

/**
 * Assigns `rows` rows of `key` to shuffle partitions. With `saltFactor > 1`, `rows` is split
 * evenly (remainder to the last sub-key, so the total is exact) across `saltFactor` salted
 * sub-keys, each hashed independently — this is what spreads one hot key across partitions.
 */
function assignKeyRows(
  partitions: Accumulator[],
  key: string,
  rows: number,
  saltFactor: number,
  shufflePartitions: number
): void {
  if (saltFactor <= 1) {
    addRowsToPartition(partitions, key, rows, shufflePartitions);
    return;
  }

  const base = Math.floor(rows / saltFactor);
  let assigned = 0;
  for (let s = 0; s < saltFactor; s++) {
    const isLast = s === saltFactor - 1;
    const share = isLast ? rows - assigned : base;
    assigned += share;
    if (share <= 0) continue;
    addRowsToPartition(partitions, saltKey(key, s, saltFactor), share, shufflePartitions);
  }
}

function addRowsToPartition(partitions: Accumulator[], key: string, rows: number, shufflePartitions: number): void {
  const partitionId = nonNegativeMod(murmur32(key), shufflePartitions);
  const partition = partitions[partitionId];
  if (partition) partition.rows += rows;
}
