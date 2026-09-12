// SAS-011 — seeded PRNG. mulberry32 is small, fast, and passes practical randomness tests well
// enough for a teaching simulator; more importantly it is trivially deterministic: the same
// seed always produces the same sequence, which is what makes `simulate()` byte-identical for a
// given (config, seed) — see docs/SIMULATOR_SPEC.md §0.

/**
 * Creates a mulberry32 PRNG. Returns a generator function producing floats in `[0, 1)`; each
 * call advances the generator's internal state, so two generators from the same seed always
 * produce the same sequence.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
