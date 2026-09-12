# tools/generator

The synthetic skew-data generator, implemented twice — TypeScript (`skew.ts`, for the in-app
slider path) and PySpark (`skew.py`, for producing real Parquet fixtures) — with a parity test
(`parity.test.ts`, SAS-032) asserting both implementations agree on key-frequency histograms
within 0.5%. See [docs/DATA_PIPELINE.md](../../docs/DATA_PIPELINE.md) §3 for the normative spec.

A real pnpm workspace member (`@sas/generator`), depending on `@sas/sim` so `skew.ts` can
deep-import `packages/sim/skew/{prng,zipf,hash,partition}.ts`'s exact algorithm rather than
duplicating it — see the comment above `skew.ts`'s imports for why this generator, unlike
`packages/fixtures/scripts/generate-synthetic.ts`, deep-imports rather than duplicates.

## Usage

```bash
# TypeScript, in-process — see skew.ts's skewedKeys().

# PySpark half — pure Python for the histogram/CLI path, no pyspark import needed:
python tools/generator/skew.py --rows 2000000 --keys 200 --alpha 1.6 --null-fraction 0.03 --seed 42

# Machine-readable output, for the parity test:
python tools/generator/skew.py --rows 2000000 --keys 200 --alpha 1.6 --null-fraction 0.03 --seed 42 --json

# Unit tests (no cluster needed):
pnpm test -- tools/generator
python tools/generator/skew_test.py
```

`skewed_keys_dataframe` (in `skew.py`) materializes a real Spark DataFrame per
`docs/DATA_PIPELINE.md`'s literal contract, for use from a capture scenario runner
(`tools/capture/m1_skew.py`/`m2_aqe.py` — see their own docstrings for the intended follow-up swap,
not required for E4's Definition of Done). It imports `pyspark` lazily, only when called.
