// SAS-019 — golden tests. `simulate(config, seed)` output hash matches a committed snapshot for
// 12 canonical configs. See docs/SIMULATOR_SPEC.md §5.
//
// The hash below is deliberately a small inline FNV-1a over a canonicalized JSON string, not a
// Vitest binary snapshot file and not Node's `crypto` — this keeps a hash change a one-line
// diff a PR description can explain (per docs/CONTRIBUTING.md: "if a golden snapshot changes,
// explain why the old output was wrong"), and keeps this file free of a Node-only dependency.
// It stays out of `packages/sim/model/`'s coverage-checked surface by living only in this test
// file rather than being exported from a source module.

import { describe, expect, it } from 'vitest';
import { CANONICAL_CONFIGS } from './canonical-configs';
import { simulate } from './simulate';

/** Sorts object keys recursively so JSON.stringify output doesn't depend on insertion order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** FNV-1a, 32-bit, rendered as an 8-hex-digit string. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashResult(config: (typeof CANONICAL_CONFIGS)[string], seed: number): string {
  return fnv1a(stableStringify(simulate(config, seed)));
}

// GOLDEN HASHES — committed truth. A hash changing means simulate()'s output changed for that
// config; the PR must explain why the old output was wrong (docs/CONTRIBUTING.md).
const GOLDEN_HASHES: Record<string, string> = {
  uniform: '280cff89',
  'mild-skew': '73695eab',
  'visible-straggler': 'afdac729',
  'hero-before': '050383e3',
  'partial-fix': '3071c526',
  'hero-after': '2989b45c',
  'null-trap': '9c07aadd',
  'severe-skew': 'a05c10df',
  'aqe-off': '4514ee23',
  'aqe-coalesce-only': '68b9bd7e',
  'aqe-skew-split': '5cdb2830',
  'aqe-join-switch': '77a0a6fd',
};

const SEED = 1;

describe('golden: simulate(config, seed) matches the committed hash', () => {
  for (const [name, config] of Object.entries(CANONICAL_CONFIGS)) {
    it(name, () => {
      const expected = GOLDEN_HASHES[name];
      expect(expected, `no golden hash registered for "${name}"`).toBeDefined();
      expect(hashResult(config, SEED)).toBe(expected);
    });
  }

  it('covers exactly the 12 canonical configs', () => {
    expect(Object.keys(CANONICAL_CONFIGS).sort()).toEqual(Object.keys(GOLDEN_HASHES).sort());
    expect(Object.keys(CANONICAL_CONFIGS).length).toBe(12);
  });
});
