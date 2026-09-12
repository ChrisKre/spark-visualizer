"""SAS-030 — the PySpark half of the synthetic skew-key generator. See docs/DATA_PIPELINE.md §3
("Synthetic generator — ship it twice") for the normative spec and tools/generator/skew.ts for the
TypeScript half; SAS-032's parity test asserts both agree on key-frequency histograms within 0.5%
per bucket.

Cross-language RNG parity: `mulberry32` below is a bit-for-bit port of
packages/sim/skew/prng.ts's mulberry32, not a statistical approximation reconciled against numpy's
or PySpark's native RNG. Every intermediate value is masked to an unsigned 32-bit int (`_u32`)
after each combining step, which reproduces JS's `>>> 0` / `Math.imul` wraparound exactly —
multiplication modulo 2**32 depends only on the operands' bit patterns, not on whether they are
read as signed or unsigned, so masking throughout and only at the end is a faithful port rather
than an approximation. "Same seed" therefore means the literal same uniform sequence on both
sides; the 0.5% tolerance in the parity test is a cushion for `round()`-mode and libm `pow()`
ULP-level differences, not for RNG-family divergence. See skew_test.py for golden-vector
verification against the real TypeScript output.

This module's histogram path (skewed_keys_histogram, the CLI below) never imports pyspark — it is
pure Python, cheap to run in CI with no Java/Spark dependency. Only skewed_keys_dataframe, which
materializes docs/DATA_PIPELINE.md §3's literal "real Spark DataFrame" contract for producing
capture-grid fixtures, imports pyspark, and does so lazily inside the function body.

Do NOT reuse tools/capture/m1_skew.py's/m2_aqe.py's inline `zipf_key_expr` — that is a documented
approximation (unseeded, not exact inverse-transform sampling) for capture-session realism only,
explicitly flagged there as "swap this for tools.generator.skew once E4 lands."
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Callable

# Individual inverse-transform draws are capped at this many, regardless of n_rows — a performance
# choice, not a fitted calibration constant. Mirrors packages/sim/skew/partition.ts's
# ZIPF_SAMPLE_CAP exactly. See docs/SIMULATOR_SPEC.md §2 Step 1's "Implementation note".
ZIPF_SAMPLE_CAP = 200_000

# The single synthetic key every null row is assigned to — mirrors
# packages/sim/skew/partition.ts's NULL_KEY exactly (Spark's HashPartitioner sends every null to
# the same reducer).
NULL_KEY = "__null__"


# --- mulberry32 PRNG — bit-for-bit port of packages/sim/skew/prng.ts ------------------------


def _u32(x: int) -> int:
    return x & 0xFFFFFFFF


def _imul32(a: int, b: int) -> int:
    """Port of JS's Math.imul: 32-bit integer multiplication, wrapping modulo 2**32. Returned as
    an unsigned residue — see this module's docstring for why that's equivalent to JS's signed
    Int32 result for every purpose this PRNG uses it for (XOR, addition, then a final mask)."""
    return _u32(a * b)


def mulberry32(seed: int) -> Callable[[], float]:
    """Bit-for-bit port of packages/sim/skew/prng.ts's mulberry32. Returns a generator function
    producing floats in [0, 1); the same seed always produces the same sequence, matching the JS
    implementation value-for-value (see skew_test.py's golden vectors)."""
    state = _u32(seed)

    def next_value() -> float:
        nonlocal state
        state = _u32(state + 0x6D2B79F5)
        t = state
        t = _imul32(t ^ (t >> 15), t | 1)
        t = _u32(t ^ _u32(t + _imul32(t ^ (t >> 7), t | 61)))
        return _u32(t ^ (t >> 14)) / 4294967296

    return next_value


# --- Zipf distribution over key ids 1..N — port of packages/sim/skew/zipf.ts -----------------


def harmonic_number(n: int, alpha: float) -> float:
    """The generalized harmonic number H(N, alpha) = sum_{i=1}^{N} i^(-alpha) — the Zipf normaliser."""
    return sum(i**-alpha for i in range(1, n + 1))


def zipf_pmf(k: int, alpha: float, h: float) -> float:
    """p(k) = k^(-alpha) / H(N, alpha), for k = 1..N."""
    return k**-alpha / h


def sample_zipf_keys(rng: Callable[[], float], n: int, alpha: float, sample_size: int) -> list[int]:
    """Draws sample_size key ids (1-based, up to n) from a Zipf(alpha) distribution over n keys,
    via inverse-transform sampling against the given PRNG — a direct port of zipf.ts's
    sampleZipfKeys, including its private binary-search-over-CDF helper."""
    h = harmonic_number(n, alpha)
    cdf: list[float] = [0.0] * n
    cumulative = 0.0
    for k in range(1, n + 1):
        cumulative += zipf_pmf(k, alpha, h)
        cdf[k - 1] = cumulative

    keys = [0] * sample_size
    for i in range(sample_size):
        keys[i] = _binary_search_cdf(cdf, rng()) + 1  # key ids are 1-based
    return keys


def _binary_search_cdf(cdf: list[float], u: float) -> int:
    """Smallest index i such that cdf[i] >= u. cdf is non-decreasing and its last entry is ~1."""
    lo, hi = 0, len(cdf) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cdf[mid] < u:
            lo = mid + 1
        else:
            hi = mid
    return lo


# --- salting transform — port of packages/sim/skew/hash.ts's saltKey ------------------------


def salt_key(key: str, sub_index: int, salt_factor: int) -> str:
    """With salt_factor > 1, key k becomes k_<s> for sub-index s — spreading one hot key across
    salt_factor labels. salt_factor <= 1 is a no-op (returns key unchanged)."""
    if salt_factor <= 1:
        return key
    return f"{key}_{sub_index % salt_factor}"


# --- key-frequency histogram — port of packages/sim/skew/partition.ts's computePartitionSizes,
# --- stopped short of hashing into shuffle partitions (see tools/generator/skew.ts's skewedKeys,
# --- which mirrors this same pipeline shape on the TS side) ----------------------------------


@dataclass(frozen=True)
class SkewHistogram:
    counts: dict[str, int]  # key label -> row count; the null bucket appears under NULL_KEY
    rows: int  # echoes n_rows; sum(counts.values()) == rows is an invariant (within rounding)


def _assign_salted_rows(counts: dict[str, int], key: str, rows: int, salt_factor: int) -> None:
    """Records `rows` rows of `key` into `counts`, splitting evenly (remainder to the last
    sub-key, so the total stays exact) across salt_factor salted sub-keys when salt_factor > 1 —
    the same split partition.ts's assignKeyRows performs before hashing, minus the hashing step."""
    if rows <= 0:
        return
    if salt_factor <= 1:
        counts[key] = counts.get(key, 0) + rows
        return

    base = rows // salt_factor
    assigned = 0
    for s in range(salt_factor):
        is_last = s == salt_factor - 1
        share = rows - assigned if is_last else base
        assigned += share
        if share <= 0:
            continue
        label = salt_key(key, s, salt_factor)
        counts[label] = counts.get(label, 0) + share


def skewed_keys_histogram(
    n_rows: int,
    alpha: float,
    n_keys: int,
    null_frac: float,
    seed: int = 42,
    salt_factor: int = 1,
) -> SkewHistogram:
    """Generates a key-frequency histogram for n_rows rows distributed over a Zipf(alpha)
    distribution of n_keys keys, with null_frac of rows assigned to a single synthetic null key
    first. Pure Python — no pyspark import. Mirrors tools/generator/skew.ts's skewedKeys exactly:
    nulls-first, then a capped-and-scaled Zipf sample, then salting."""
    counts: dict[str, int] = {}
    rng = mulberry32(seed)

    null_rows = round(n_rows * null_frac)
    remaining_rows = n_rows - null_rows

    if null_rows > 0:
        _assign_salted_rows(counts, NULL_KEY, null_rows, salt_factor)

    if remaining_rows > 0 and n_keys > 0:
        sample_size = max(1, min(remaining_rows, ZIPF_SAMPLE_CAP))
        sampled_keys = sample_zipf_keys(rng, n_keys, alpha, sample_size)

        sample_counts: dict[int, int] = {}
        for key in sampled_keys:
            sample_counts[key] = sample_counts.get(key, 0) + 1

        scale = remaining_rows / sample_size
        for key, sample_count in sample_counts.items():
            key_rows = round(sample_count * scale)
            if key_rows <= 0:
                continue
            _assign_salted_rows(counts, str(key), key_rows, salt_factor)

    return SkewHistogram(counts=counts, rows=n_rows)


# --- real Spark DataFrame materialization — docs/DATA_PIPELINE.md §3's literal contract ------


def skewed_keys_dataframe(spark, n_rows: int, alpha: float, n_keys: int, null_frac: float, seed: int = 42):
    """Materializes docs/DATA_PIPELINE.md §3's skewed_keys(spark, ...) contract: one row per input
    row, columns `key` (string, None for the null bucket) and `amount` (F.randn(seed)*40+120).

    Deliberately NOT implemented via Spark's native F.rand/closed-form inverse (that is only an
    approximation, like tools/capture/m1_skew.py's already-flagged zipf_key_expr, and would fail
    the parity test). Instead, calls skewed_keys_histogram() for the exact, parity-tested key
    assignment, then explodes the resulting (key, count) pairs into a real per-row Spark
    DataFrame — no per-row Python UDF, so this scales to n_rows in the tens of millions.

    `import pyspark` happens lazily inside this function only: the CLI and the parity test never
    call this, so neither needs pyspark installed.
    """
    from pyspark.sql import functions as F  # noqa: N812 (Spark's own convention)
    from pyspark.sql.types import StringType, StructField, StructType

    histogram = skewed_keys_histogram(n_rows, alpha, n_keys, null_frac, seed)
    rows = [(None if key == NULL_KEY else key, count) for key, count in histogram.counts.items()]
    schema = StructType([StructField("key", StringType(), True), StructField("count", "int", False)])
    key_counts = spark.createDataFrame(rows, schema)

    return (
        key_counts.withColumn("_n", F.explode(F.sequence(F.lit(1), F.col("count"))))
        .drop("count", "_n")
        .withColumn("amount", F.randn(seed) * 40 + 120)
    )


# --- CLI --------------------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, required=True, help="total row count")
    parser.add_argument("--keys", type=int, required=True, help="key cardinality (N)")
    parser.add_argument("--alpha", type=float, required=True, help="Zipf exponent")
    parser.add_argument("--null-fraction", type=float, default=0.0)
    parser.add_argument("--salt-factor", type=int, default=1)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON (for the parity test)")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    histogram = skewed_keys_histogram(
        n_rows=args.rows,
        alpha=args.alpha,
        n_keys=args.keys,
        null_frac=args.null_fraction,
        seed=args.seed,
        salt_factor=args.salt_factor,
    )

    if args.json:
        print(json.dumps({"counts": histogram.counts, "rows": histogram.rows}))
        return

    top = sorted(histogram.counts.items(), key=lambda kv: kv[1], reverse=True)[:10]
    null_count = histogram.counts.get(NULL_KEY, 0)
    print(f"rows={histogram.rows} keys_populated={len(histogram.counts)} null_rows={null_count}")
    print("top 10 keys:")
    for key, count in top:
        print(f"  {key}: {count} ({100 * count / histogram.rows:.2f}%)")


if __name__ == "__main__":
    main()
