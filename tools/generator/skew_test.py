"""SAS-030/031 — unit tests for skew.py's pure numeric helpers, independent of pyspark and of
tools/generator/skew.ts. Runs with the stdlib only: `python tools/generator/skew_test.py`.

The mulberry32 golden vectors below were captured once from the real TypeScript implementation
(packages/sim/skew/prng.ts) via a throwaway Node script — see this file's history/PR description
for the exact command. They are the concrete proof that skew.py's mulberry32 is a bit-for-bit
port, not a lookalike, which is what tools/generator/parity.test.ts (SAS-032) relies on.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skew  # noqa: E402 - needs sys.path adjusted first

# Captured from packages/sim/skew/prng.ts's mulberry32 via:
#   node -e "function mulberry32(seed){let a=seed>>>0;return function(){a=(a+0x6d2b79f5)>>>0;
#   let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
#   return ((t^(t>>>14))>>>0)/4294967296;};} for (const seed of [1,42,123456789]) {
#   const rng=mulberry32(seed); const vals=[]; for (let i=0;i<5;i++) vals.push(rng());
#   console.log(seed, JSON.stringify(vals)); }"
GOLDEN_VECTORS: dict[int, list[float]] = {
    1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
    42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
    123456789: [0.2577907438389957, 0.9707721115555614, 0.7853280142880976, 0.20616457983851433, 0.30307188746519387],
}


class TestMulberry32(unittest.TestCase):
    def test_matches_typescript_golden_vectors(self):
        for seed, expected in GOLDEN_VECTORS.items():
            rng = skew.mulberry32(seed)
            actual = [rng() for _ in expected]
            for i, (a, e) in enumerate(zip(actual, expected)):
                self.assertAlmostEqual(a, e, places=12, msg=f"seed={seed} draw#{i}")

    def test_same_seed_is_deterministic(self):
        a = [skew.mulberry32(7)() for _ in range(10)]
        b = [skew.mulberry32(7)() for _ in range(10)]
        self.assertEqual(a, b)

    def test_output_range(self):
        rng = skew.mulberry32(99)
        for _ in range(10_000):
            v = rng()
            self.assertGreaterEqual(v, 0.0)
            self.assertLess(v, 1.0)


class TestZipf(unittest.TestCase):
    def test_harmonic_number_alpha_zero_equals_n(self):
        self.assertAlmostEqual(skew.harmonic_number(100, 0), 100, places=6)

    def test_alpha_zero_gives_uniform_histogram(self):
        rng = skew.mulberry32(7)
        n = 50
        samples = skew.sample_zipf_keys(rng, n, 0, 100_000)
        counts = [0] * (n + 1)
        for k in samples:
            counts[k] += 1
        expected = len(samples) / n
        for k in range(1, n + 1):
            self.assertGreater(counts[k], expected * 0.85)
            self.assertLess(counts[k], expected * 1.15)

    def test_alpha_1_6_gives_top_key_45_to_55_percent(self):
        rng = skew.mulberry32(7)
        n = 50
        sample_size = 100_000
        samples = skew.sample_zipf_keys(rng, n, 1.6, sample_size)
        share = samples.count(1) / sample_size
        self.assertGreaterEqual(share, 0.45)
        self.assertLessEqual(share, 0.55)

    def test_zipf_pmf_sums_to_one(self):
        n, alpha = 20, 1.1
        h = skew.harmonic_number(n, alpha)
        total = sum(skew.zipf_pmf(k, alpha, h) for k in range(1, n + 1))
        self.assertAlmostEqual(total, 1.0, places=6)


class TestSaltKey(unittest.TestCase):
    def test_no_op_below_threshold(self):
        self.assertEqual(skew.salt_key("42", 0, 1), "42")

    def test_appends_sub_index(self):
        self.assertEqual(skew.salt_key("42", 3, 8), "42_3")


class TestSkewedKeysHistogram(unittest.TestCase):
    def test_null_fraction_assigns_expected_count(self):
        rows = 1_000_000
        histogram = skew.skewed_keys_histogram(rows, alpha=1.6, n_keys=200, null_frac=0.03, seed=7)
        self.assertEqual(histogram.counts[skew.NULL_KEY], round(rows * 0.03))

    def test_conserves_total_rows_within_rounding(self):
        rows = 1_000_000
        histogram = skew.skewed_keys_histogram(rows, alpha=1.6, n_keys=200, null_frac=0.03, seed=7)
        total = sum(histogram.counts.values())
        self.assertGreater(total, rows * 0.99)
        self.assertLess(total, rows * 1.01)

    def test_deterministic_for_same_seed(self):
        kwargs = dict(n_rows=200_000, alpha=1.2, n_keys=200, null_frac=0.01, seed=42)
        a = skew.skewed_keys_histogram(**kwargs)
        b = skew.skewed_keys_histogram(**kwargs)
        self.assertEqual(a.counts, b.counts)

    def test_salt_factor_splits_a_hot_key(self):
        kwargs = dict(n_rows=500_000, alpha=1.6, n_keys=50, null_frac=0.0, seed=7)
        unsalted = skew.skewed_keys_histogram(**kwargs)
        salted = skew.skewed_keys_histogram(**kwargs, salt_factor=8)

        self.assertNotIn("1", salted.counts)
        salted_total = sum(salted.counts.get(f"1_{s}", 0) for s in range(8))
        self.assertEqual(salted_total, unsalted.counts["1"])


if __name__ == "__main__":
    unittest.main()
