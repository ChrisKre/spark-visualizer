// SAS-011 — Zipf distribution over key ids 1..N via inverse-transform sampling.
// See docs/SIMULATOR_SPEC.md §2 Step 1.

/** The generalized harmonic number H(N, alpha) = sum_{i=1}^{N} i^(-alpha) — the Zipf normaliser. */
export function harmonicNumber(N: number, alpha: number): number {
  let sum = 0;
  for (let i = 1; i <= N; i++) {
    sum += i ** -alpha;
  }
  return sum;
}

/** p(k) = k^(-alpha) / H(N, alpha), for k = 1..N. */
export function zipfPmf(k: number, alpha: number, H: number): number {
  return k ** -alpha / H;
}

/**
 * Draws `sampleSize` key ids (1-based, up to `N`) from a Zipf(alpha) distribution over `N` keys,
 * via inverse-transform sampling against the given PRNG. Deterministic given the same `rng`
 * sequence. `alpha = 0` degenerates to a uniform distribution over the N keys.
 *
 * Callers needing to sample far more than `N` times (e.g. one draw per row, with `rows` in the
 * tens of millions) should draw a capped number of samples and scale the resulting histogram
 * instead — see `packages/sim/skew/partition.ts`'s `ZIPF_SAMPLE_CAP`. This function itself stays
 * a plain, uncapped distribution primitive.
 */
export function sampleZipfKeys(rng: () => number, N: number, alpha: number, sampleSize: number): number[] {
  const H = harmonicNumber(N, alpha);
  const cdf = new Array<number>(N);
  let cumulative = 0;
  for (let k = 1; k <= N; k++) {
    cumulative += zipfPmf(k, alpha, H);
    cdf[k - 1] = cumulative;
  }

  const keys = new Array<number>(sampleSize);
  for (let i = 0; i < sampleSize; i++) {
    keys[i] = binarySearchCdf(cdf, rng()) + 1; // key ids are 1-based
  }
  return keys;
}

/** Smallest index `i` such that `cdf[i] >= u`. `cdf` is non-decreasing and its last entry is ~1. */
function binarySearchCdf(cdf: number[], u: number): number {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((cdf[mid] ?? 0) < u) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}
