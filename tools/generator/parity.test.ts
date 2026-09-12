// SAS-032 — parity test: tools/generator/skew.ts (TS) vs tools/generator/skew.py (PySpark) must
// produce agreeing key-frequency histograms for the same seed and parameters. This is the check
// that makes the fixtures and the in-app sliders describe the same world — see
// docs/DATA_PIPELINE.md §3.
//
// Shells out to `python tools/generator/skew.py --json` rather than maintaining a second test
// runner: this repo has exactly one test runner (Vitest) wired into `pnpm test` and CI's `test`
// job/include glob, and a Node-side test can call skewedKeys() directly while treating the Python
// side as an external process — no new CI job type, and a failure renders as a normal Vitest diff
// rather than a separate process's exit code CI has to interpret. The generator-parity CI job
// (.github/workflows/ci.yml) only needs Python installed for this, never pyspark/Java: skew.py's
// histogram path (this test's only path) never imports pyspark.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { skewedKeys } from './skew';

interface PyHistogram {
  counts: Record<string, number>;
  rows: number;
}

// docs/FIXTURES.md §5's hero "before" run (m1_a16_s1) — severe skew, no salting, a null-free
// baseline. Salting itself needs no cross-language parity check (see skew.ts's skewedKeys doc
// comment: it's pure row-index arithmetic, identical in both languages by construction), so this
// test exercises the one path that genuinely depends on both sides' RNG/Zipf math agreeing:
// nulls-first + capped-and-scaled Zipf sampling.
const PARAMS = { rows: 2_000_000, keyCardinality: 200, zipfAlpha: 1.6, nullFraction: 0.03, seed: 42 };

// Generous safety margin around what should be near-exact agreement (see skew.py's module
// docstring: mulberry32 is ported bit-for-bit, so "same seed" means the literal same uniform
// sequence, not two independently-seeded RNG families hoping to agree). The max(a, b, 1)
// denominator absorbs harmless 0-vs-1 rounding noise in the Zipf tail's least-probable keys
// without hiding a genuine large divergence.
const TOLERANCE = 0.005;

function runPython(): PyHistogram {
  const stdout = execFileSync(
    'python',
    [
      'tools/generator/skew.py',
      '--rows',
      String(PARAMS.rows),
      '--keys',
      String(PARAMS.keyCardinality),
      '--alpha',
      String(PARAMS.zipfAlpha),
      '--null-fraction',
      String(PARAMS.nullFraction),
      '--seed',
      String(PARAMS.seed),
      '--json',
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(stdout) as PyHistogram;
}

describe('generator parity: TS vs PySpark', () => {
  it('key-frequency histograms agree within 0.5% per bucket', () => {
    const ts = skewedKeys(PARAMS);
    const py = runPython();

    const allKeys = new Set([...ts.counts.keys(), ...Object.keys(py.counts)]);
    expect(allKeys.size).toBeGreaterThan(0);

    for (const key of allKeys) {
      const a = ts.counts.get(key) ?? 0;
      const b = py.counts[key] ?? 0;
      const denom = Math.max(a, b, 1);
      expect(Math.abs(a - b) / denom, `bucket "${key}": ts=${a} py=${b}`).toBeLessThanOrEqual(TOLERANCE);
    }
  });

  it('both sides conserve total rows', () => {
    const ts = skewedKeys(PARAMS);
    const py = runPython();

    const tsTotal = Array.from(ts.counts.values()).reduce((s, n) => s + n, 0);
    const pyTotal = Object.values(py.counts).reduce((s, n) => s + n, 0);

    expect(tsTotal).toBeGreaterThan(PARAMS.rows * 0.99);
    expect(pyTotal).toBeGreaterThan(PARAMS.rows * 0.99);
  });
});
