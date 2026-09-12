# Data pipeline

Three kinds of data, three jobs. Do not confuse them.

| Kind | Lives in | Job |
|---|---|---|
| **Fixtures** | `packages/fixtures/data/*.json` | make the numbers true — see [FIXTURES.md](./FIXTURES.md) |
| **Slim Parquet** | `public/data/*.parquet` (≤ 40 MB total) | let DuckDB-WASM run real queries in the tab |
| **Fat Parquet** | object storage, range-read over HTTP | demonstrate column pruning with real byte counters |

## 1. Hero dataset — NYC TLC trip records

Public, monthly Parquet, no licence friction, and the skew is real rather than manufactured.

**Where the skew lives**

| Column | Character | Teaches |
|---|---|---|
| `PULocationID` | JFK (132), LaGuardia (138) and Midtown zones dominate; the tail is long | classic key skew, salting |
| `payment_type` | ~70 % one value | low-cardinality partitioning, idle reducers |
| `VendorID` | two real values | why grouping on it wastes 198 of 200 partitions |
| `passenger_count` | nulls present in real extracts | the null-key trap — every null hashes to one partition |
| `tpep_pickup_datetime` | natural date partitioning | partition pruning, Z-ordering |

**Joins.** `taxi_zone_lookup.csv` (265 rows) is the textbook broadcast candidate, and the thing
M3 uses to show a broadcast that is *correct* — then the same join against a synthetic 4 GB
dimension to show one that is not.

**Scale.** 2019 full year is roughly 84 M rows. Use `2019-01`…`2019-06` for fixtures; the COVID
period is reserved for the anomaly-detection story.

## 2. Secondary datasets

| Dataset | Used by | Why it is here |
|---|---|---|
| **GH Archive** (`gharchive.org`) | M5 shuffle mechanics | genuinely power-law actor/repo counts — bot accounts sit orders of magnitude above the median. Nested JSON → explode → group by actor is a real shuffle monster. |
| **REES46 e-commerce clickstream** | v2 | sessionisation via window functions, an unavoidable large exchange; funnel analytics hook |
| **NASA C-MAPSS turbofan** | domain framing | small and clean, but the cleanest public predictive-maintenance narrative: RUL regression, framed as *featurisation is the distributed problem, not the model* |
| **Wikipedia pageviews** | tiny live demo | ~50 MB gzip per hour, `Main_Page` always dominates — a two-minute skew demo with no setup |

## 3. Synthetic generator — ship it twice

Real data proves the pathology exists in the wild. Synthetic data is the only way to give a user
a *continuous control* over it. The same generator exists in two languages with identical
semantics and identical seeds: TypeScript drives the sliders in the browser, PySpark produces the
calibration runs.

```python
# tools/generator/skew.py
def skewed_keys(spark, n_rows, alpha, n_keys, null_frac, seed=42):
    """Zipf(alpha) over n_keys, plus a null slug that all hashes to one partition."""
    return (spark.range(n_rows)
        .withColumn("r", F.rand(seed))
        # alpha=0 -> uniform; alpha=1.6 -> top key owns ~50 %
        .withColumn("key", F.when(F.col("r") < null_frac, F.lit(None))
                            .otherwise(zipf_inverse(F.col("r"), alpha, n_keys)))
        .withColumn("amount", F.randn(seed) * 40 + 120))
```

```ts
// tools/generator/skew.ts — must produce the same histogram for the same seed
export function skewedKeys(opts: SkewOpts): SkewHistogram { /* mulberry32 + inverse transform */ }
```

As shipped, `SkewHistogram` is `{ counts: Map<string, number>; rows: number }` rather than the
bare `Int32Array` sketched above — a `Map` keyed by label represents the null bucket (`__null__`)
and salted sub-keys (`42_0`, `42_1`, ...) directly, which a plain index-keyed array can't. Both
implementations deep-import `packages/sim/skew/{prng,zipf,hash,partition}.ts`'s exact algorithm
(TS directly; PySpark via a bit-for-bit `mulberry32` port) rather than reimplementing it, so "same
seed" means the literal same uniform sequence on both sides — see `tools/generator/skew.ts`'s and
`skew.py`'s module comments.

**Parity test (CI):** both implementations, same seed and parameters, must produce key-frequency
histograms whose per-bucket counts agree within 0.5 %. This test is the reason the fixtures and
the sliders describe the same world.

### The three controls, and why each exists

| Control | Range | What it teaches |
|---|---|---|
| `zipfAlpha` | 0 – 2.2 | how heavy the tail is; the straggler appears around 1.2 |
| `keyCardinality` | 2 – 100,000 | 200 shuffle partitions and 12 distinct keys means 188 idle reducers |
| `nullFraction` | 0 – 0.15 | **the one that wins interviews** — a 3 % null rate on a join key can produce a worse straggler than any real business key, and the fix is a filter, not a salt |

## 4. Slim Parquet build

```bash
python tools/data/build_slim.py --months 2019-01..2019-06 --out apps/web/public/data/
```

Produces:

- `trips_hourly.parquet` — pre-aggregated to zone × hour, ~2 MB. Drives the anomaly chart.
- `trips_sample.parquet` — 2 M-row stratified sample preserving the `PULocationID`
  distribution, ~28 MB. Drives the DuckDB query pane.
- `zones.parquet` — 265 rows. The broadcast side.

Budget: **≤ 40 MB total** in `public/`. Anything larger goes to the fat dataset.

## 5. Fat Parquet and the free lesson

Host one full partitioned dataset (~500 MB) on object storage with CORS and range requests
enabled. DuckDB-WASM reads it over HTTP range requests, so:

```sql
SELECT passenger_count, count(*) FROM read_parquet('https://.../trips/*.parquet')
GROUP BY 1;
```

physically fetches a few hundred kB out of 500 MB. Print **bytes actually transferred** beside
the query. Column pruning and row-group skipping stop being claims and become a counter the user
watches move — the `EXECUTED` layer earning its place.

Requirements on the bucket: CORS `GET`/`HEAD` with `Range` allowed, `Accept-Ranges: bytes`,
long `Cache-Control`, and a row-group size of 128 MB → deliberately *not* tuned, so the
small-file/large-row-group tradeoff is demonstrable in M6.

## 6. Licensing

| Dataset | Terms | Obligation |
|---|---|---|
| NYC TLC | public domain, NYC Open Data | attribute the TLC; do not imply endorsement |
| GH Archive | CC-BY-4.0 style, per site terms | attribute gharchive.org |
| REES46 clickstream | check the Kaggle dataset licence before shipping | do not redistribute raw; ship derived aggregates only |
| C-MAPSS | NASA public release | attribute NASA Prognostics Data Repository |
| Wikipedia pageviews | CC0 / Wikimedia terms | attribute Wikimedia |

Attribution lives in `/about` and in this file. Never commit raw third-party data to the repo —
commit the build script and the derived slim artefacts only.
