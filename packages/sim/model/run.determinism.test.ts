// SAS-019 — determinism test. See docs/SIMULATOR_SPEC.md §5.
//
// Deliberately a small, cheap config, not one of the large 12 canonical configs — determinism
// is a property of the RNG/arithmetic, not of scale, and keeping this config small is what keeps
// 100 repeated runs fast in CI.

import { describe, expect, it } from 'vitest';
import { testConfig } from './test-helpers';
import { simulate } from './simulate';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const smallConfig = testConfig({
  query: { kind: 'join', joinType: 'inner', other: { rows: 265, bytesPerRow: 128 } },
  data: { rows: 100_000, keyCardinality: 500, zipfAlpha: 1.4, nullFraction: 0.01, bytesPerRow: 100, saltFactor: 2 },
  sql: { shufflePartitions: 50 },
});

describe('determinism: 100 runs of the same input produce one distinct output hash', () => {
  it('holds for simulate(config, seed)', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      hashes.add(fnv1a(stableStringify(simulate(smallConfig, 7))));
    }
    expect(hashes.size).toBe(1);
  });

  it('different seeds are allowed to (and do) produce different hashes', () => {
    const a = fnv1a(stableStringify(simulate(smallConfig, 1)));
    const b = fnv1a(stableStringify(simulate(smallConfig, 2)));
    expect(a).not.toBe(b);
  });
});
