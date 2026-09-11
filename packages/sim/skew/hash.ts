// SAS-012 — seeded 32-bit hashing + the salting transform. See docs/SIMULATOR_SPEC.md §2 Step 1.

/**
 * MurmurHash3 (x86, 32-bit), seeded. Deterministic — the same `(key, seed)` always hashes the
 * same. Used so key→partition collisions look like real hash-partition collisions rather than a
 * perfectly even spread.
 */
export function murmur32(key: string, seed = 0): number {
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  const len = key.length;
  const roundedEnd = len - (len % 4);

  let h1 = seed >>> 0;
  let i = 0;

  for (; i < roundedEnd; i += 4) {
    let k1 =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) | 0;
  }

  let k1 = 0;
  const rem = len % 4;
  if (rem === 3) k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
  if (rem >= 2) k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
  if (rem >= 1) {
    k1 ^= key.charCodeAt(i) & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h1 ^= k1;
  }

  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/** A true modulo (always non-negative), unlike JS's `%` which keeps the sign of `n`. */
export function nonNegativeMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * The salting transform: with `saltFactor > 1`, key `k` becomes `k_<s>` for each sub-index
 * `s` in `0..saltFactor-1` before hashing, spreading one hot key across `saltFactor` partitions.
 * `saltFactor <= 1` is a no-op (returns `key` unchanged).
 */
export function saltKey(key: string, subIndex: number, saltFactor: number): string {
  if (saltFactor <= 1) return key;
  return `${key}_${subIndex % saltFactor}`;
}
