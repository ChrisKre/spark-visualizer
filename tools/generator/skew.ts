// SAS-031 — the TypeScript half of the synthetic skew-key generator. See docs/DATA_PIPELINE.md §3
// ("Synthetic generator — ship it twice") for the normative spec and tools/generator/skew.py for
// the PySpark half; SAS-032's parity test asserts both agree on key-frequency histograms.
//
// Deep-imports packages/sim/skew/{prng,zipf,hash,partition}.ts directly rather than duplicating
// the algorithm locally. This is a deliberate divergence from packages/fixtures/scripts/
// generate-synthetic.ts, which duplicates a local mulberry32 specifically because it judged
// deep-importing sim's non-barrel internals unsafe (they aren't re-exported from
// packages/sim/index.ts, @sas/sim's declared public API). That's the right call for a fixture
// generator that only needs jitter noise; it's the wrong call here, where the whole point is that
// this generator and the simulator's own partition-sizing model describe the same distribution —
// duplicating risks silent drift exactly where SAS-032 is designed to catch it. Importing directly
// is legal: packages/sim/package.json declares no "exports" field (so subpath imports aren't
// restricted), and dependency-cruiser's sim-zero-workspace-deps rule only forbids edges *out of*
// packages/sim, not edges reaching into it.
import { mulberry32 } from '@sas/sim/skew/prng';
import { sampleZipfKeys } from '@sas/sim/skew/zipf';
import { saltKey } from '@sas/sim/skew/hash';
import { NULL_KEY, ZIPF_SAMPLE_CAP } from '@sas/sim/skew/partition';

export interface SkewOpts {
  /** Total row count to distribute across keys. */
  rows: number;
  /** N — the number of distinct non-null keys the Zipf distribution ranges over. */
  keyCardinality: number;
  /** Zipf exponent. 0 = uniform; higher = heavier tail (see docs/DATA_PIPELINE.md §3's table). */
  zipfAlpha: number;
  /** Fraction of rows assigned to the single null key, before any Zipf sampling. */
  nullFraction: number;
  /** Seed for the deterministic PRNG — same seed + same opts always produces the same histogram. */
  seed: number;
  /** With saltFactor > 1, each key's rows are split evenly across saltFactor salted sub-keys
   *  (e.g. "42_0", "42_1"), spreading a hot key across salted labels. Default 1 (no salting). */
  saltFactor?: number;
}

export interface SkewHistogram {
  /** Key label -> row count. The null bucket appears under the literal NULL_KEY label (itself
   *  salted into "__null___0"/"__null___1"/... if saltFactor > 1, exactly like any other key). */
  counts: Map<string, number>;
  /** Echoes opts.rows — `sum(counts.values()) === rows` is an invariant, useful for assertions. */
  rows: number;
}

/**
 * Generates a key-frequency histogram for `rows` rows distributed over a Zipf(zipfAlpha)
 * distribution of `keyCardinality` keys, with `nullFraction` of rows assigned to a single
 * synthetic null key first — mirroring Spark's HashPartitioner sending every null to one reducer.
 *
 * This reuses packages/sim/skew/partition.ts's computePartitionSizes pipeline shape exactly
 * (nulls-first, then a capped-and-scaled Zipf sample, then salting) but stops short of hashing
 * into shuffle partitions: the output here is a row/key dataset (a histogram), not partition byte
 * totals. See tools/generator/skew.py's skewed_keys_histogram for the PySpark equivalent.
 */
export function skewedKeys(opts: SkewOpts): SkewHistogram {
  const { rows, keyCardinality, zipfAlpha, nullFraction, seed, saltFactor = 1 } = opts;
  const counts = new Map<string, number>();
  const rng = mulberry32(seed);

  const nullRows = Math.round(rows * nullFraction);
  const remainingRows = rows - nullRows;

  if (nullRows > 0) {
    assignSaltedRows(counts, NULL_KEY, nullRows, saltFactor);
  }

  if (remainingRows > 0 && keyCardinality > 0) {
    // Individual inverse-transform draws are capped regardless of `rows`, then the sampled
    // histogram is scaled up — see docs/SIMULATOR_SPEC.md §2 Step 1's "Implementation note",
    // which this pipeline mirrors verbatim.
    const sampleSize = Math.max(1, Math.min(remainingRows, ZIPF_SAMPLE_CAP));
    const sampledKeys = sampleZipfKeys(rng, keyCardinality, zipfAlpha, sampleSize);

    const sampleCounts = new Map<number, number>();
    for (const key of sampledKeys) {
      sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1);
    }

    const scale = remainingRows / sampleSize;
    for (const [key, sampleCount] of sampleCounts) {
      const keyRows = Math.round(sampleCount * scale);
      if (keyRows <= 0) continue;
      assignSaltedRows(counts, String(key), keyRows, saltFactor);
    }
  }

  return { counts, rows };
}

/**
 * Records `rows` rows of `key` into `counts`, splitting evenly (remainder to the last sub-key, so
 * the total stays exact) across `saltFactor` salted sub-keys when `saltFactor > 1` — the same
 * split partition.ts's assignKeyRows performs before hashing, minus the hashing step.
 */
function assignSaltedRows(counts: Map<string, number>, key: string, rows: number, saltFactor: number): void {
  if (rows <= 0) return;
  if (saltFactor <= 1) {
    counts.set(key, (counts.get(key) ?? 0) + rows);
    return;
  }

  const base = Math.floor(rows / saltFactor);
  let assigned = 0;
  for (let s = 0; s < saltFactor; s++) {
    const isLast = s === saltFactor - 1;
    const share = isLast ? rows - assigned : base;
    assigned += share;
    if (share <= 0) continue;
    const label = saltKey(key, s, saltFactor);
    counts.set(label, (counts.get(label) ?? 0) + share);
  }
}
