"""SAS-033 — builds the slim NYC TLC Parquet dataset that ships in the repo for DuckDB-WASM
(v1.1) to query in the browser. See docs/DATA_PIPELINE.md §4:

    python tools/data/build_slim.py --months 2019-01..2019-06 --out apps/web/public/data/

(Note: docs/DATA_PIPELINE.md's own example says `--out public/data/` — there is no top-level
`/public` in this repo, only `apps/web/public/`, which is what Next.js's static export actually
serves; this script's `--out` default is `apps/web/public/data/` and the doc's example should be
read with that correction.)

Produces three files in `--out`:
  - trips_hourly.parquet  — pre-aggregated to zone x hour, drives the anomaly chart (~2 MB)
  - trips_sample.parquet  — a stratified sample preserving the PULocationID distribution, drives
                            the DuckDB query pane (~28 MB)
  - zones.parquet         — taxi_zone_lookup.csv passthrough, the broadcast side (265 rows)
Budget: <= 40 MB total (docs/CONTRIBUTING.md's performance gates table doesn't list this one
explicitly, but docs/DATA_PIPELINE.md §4 and BACKLOG.md's SAS-033 "Done when" both do) — this
script exits non-zero if the written files exceed it.

Library choice: pandas + pyarrow + scipy, not PySpark. This is a single-machine columnar batch
transform over already-Parquet monthly source files, not a distributed shuffle; running it through
a local Spark session would add real JVM/Docker setup (see tools/capture/requirements.txt's own
notes on pyspark version/Python compatibility) for no benefit here, and doesn't fit this ticket's
2-hour, good-first sizing. Each month is downloaded, processed, and discarded in turn, so memory
stays bounded regardless of how many months are requested.

Raw source files are downloaded into `--raw-dir` (default tools/data/_raw/, gitignored) and are
NEVER committed — only this script and the derived slim artefacts are (docs/DATA_PIPELINE.md §6).

NOT executed as part of landing this ticket: the real multi-GB monthly download. This module's
transform functions (aggregate_hourly, stratified_sample, ks_check, parse_months) are unit-tested
against small synthetic in-memory DataFrames in build_slim_test.py, independent of any network
access — run the real download-and-build locally when ready.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from dataclasses import dataclass

import pandas as pd
import pyarrow.parquet as pq
from scipy import stats

# Source URLs — the well-known NYC TLC CloudFront distribution as of this writing. CloudFront
# paths have moved before; verify these still resolve before running the real (deferred) download.
TRIP_DATA_URL = "https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_{month}.parquet"
ZONE_LOOKUP_URL = "https://d37ci6vzurychx.cloudfront.net/misc/taxi_zone_lookup.csv"

# The slim column set — enough to support docs/DATA_PIPELINE.md §1's skew-column table
# (PULocationID/payment_type/VendorID/passenger_count/tpep_pickup_datetime) and the DuckDB query
# pane's join/aggregate demos, without pulling every raw column (keeping trips_sample.parquet
# inside its ~28 MB share of the 40 MB budget).
SLIM_COLUMNS = [
    "tpep_pickup_datetime",
    "PULocationID",
    "DOLocationID",
    "payment_type",
    "passenger_count",
    "VendorID",
    "trip_distance",
    "total_amount",
]

MAX_TOTAL_BYTES = 40 * 1024 * 1024  # docs/DATA_PIPELINE.md §4 / BACKLOG.md SAS-033 "Done when"
DEFAULT_OUT_DIR = os.path.join("apps", "web", "public", "data")
DEFAULT_RAW_DIR = os.path.join("tools", "data", "_raw")


# --- month range parsing ----------------------------------------------------------------------


def parse_months(spec: str) -> list[str]:
    """Parses `--months`: either an inclusive `YYYY-MM..YYYY-MM` range or a comma-separated list
    (`2019-01,2019-02`) — the latter mainly useful for quick local testing of a single month."""
    if ".." in spec:
        start, end = spec.split("..", 1)
        return _month_range(start.strip(), end.strip())
    return [m.strip() for m in spec.split(",") if m.strip()]


def _month_range(start: str, end: str) -> list[str]:
    start_year, start_month = (int(p) for p in start.split("-"))
    end_year, end_month = (int(p) for p in end.split("-"))
    if (end_year, end_month) < (start_year, start_month):
        raise ValueError(f"--months range end {end} is before start {start}")

    months = []
    year, month = start_year, start_month
    while (year, month) <= (end_year, end_month):
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month > 12:
            month = 1
            year += 1
    return months


# --- download ----------------------------------------------------------------------------------


def download(url: str, dest: str, skip_download: bool) -> str:
    if skip_download and os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"downloading {url} -> {dest}")
    urllib.request.urlretrieve(url, dest)  # noqa: S310 - fixed, hardcoded HTTPS source, not user input
    return dest


def download_month(month: str, raw_dir: str, skip_download: bool) -> str:
    dest = os.path.join(raw_dir, f"yellow_tripdata_{month}.parquet")
    return download(TRIP_DATA_URL.format(month=month), dest, skip_download)


def download_zone_lookup(raw_dir: str, skip_download: bool) -> str:
    dest = os.path.join(raw_dir, "taxi_zone_lookup.csv")
    return download(ZONE_LOOKUP_URL, dest, skip_download)


# --- per-month transforms -----------------------------------------------------------------------


def read_month_slim(path: str) -> pd.DataFrame:
    """Reads only SLIM_COLUMNS from a monthly trip-data Parquet file."""
    table = pq.read_table(path, columns=SLIM_COLUMNS)
    return table.to_pandas()


def aggregate_hourly(df: pd.DataFrame) -> pd.DataFrame:
    """Groups by (PULocationID, pickup hour), producing the pre-aggregated table that drives the
    anomaly chart. Output columns: PULocationID, pickup_hour, trip_count, avg_trip_distance,
    avg_total_amount."""
    hour = pd.to_datetime(df["tpep_pickup_datetime"]).dt.floor("h")
    grouped = df.assign(pickup_hour=hour).groupby(["PULocationID", "pickup_hour"], as_index=False).agg(
        trip_count=("PULocationID", "size"),
        avg_trip_distance=("trip_distance", "mean"),
        avg_total_amount=("total_amount", "mean"),
    )
    return grouped


def stratified_sample(df: pd.DataFrame, target_rows: int, seed: int) -> pd.DataFrame:
    """Samples `target_rows` rows from `df`, allocated proportionally across `PULocationID`
    strata matching each stratum's share of `df` — preserving the PULocationID distribution by
    construction rather than by chance."""
    target_rows = min(target_rows, len(df))
    if target_rows <= 0:
        return df.iloc[0:0]

    counts = df["PULocationID"].value_counts()
    # Largest-remainder allocation so per-stratum sample sizes sum to exactly target_rows.
    raw_shares = counts / counts.sum() * target_rows
    base = raw_shares.astype(int)
    remainder = (raw_shares - base).sort_values(ascending=False)
    shortfall = target_rows - base.sum()
    bump_zones = remainder.index[:shortfall]
    allocation = base.copy()
    allocation.loc[bump_zones] += 1

    parts = []
    for zone, n in allocation.items():
        if n <= 0:
            continue
        stratum = df[df["PULocationID"] == zone]
        n = min(n, len(stratum))
        parts.append(stratum.sample(n=n, random_state=seed))
    if not parts:
        return df.iloc[0:0]
    return pd.concat(parts, ignore_index=True)


# --- KS check --------------------------------------------------------------------------------


@dataclass(frozen=True)
class KsResult:
    statistic: float
    pvalue: float
    passed: bool


def ks_check(population_ids: pd.Series, sample_ids: pd.Series, threshold: float) -> KsResult:
    """Kolmogorov-Smirnov two-sample test comparing PULocationID's empirical distribution between
    the full population and the stratified sample, treated as an ordinal numeric array (the
    ticket specifies a KS test; a fixed 265-category variable would more textbook-classically get
    a chi-square goodness-of-fit test, which is a straightforward swap later if this proves too
    lenient or too strict — the CLI/output contract wouldn't need to change).

    `passed` is True when the KS D-statistic is at or below `threshold`, i.e. the sample's
    distribution is judged statistically indistinguishable from the population's."""
    result = stats.ks_2samp(population_ids.astype(float), sample_ids.astype(float))
    return KsResult(statistic=float(result.statistic), pvalue=float(result.pvalue), passed=result.statistic <= threshold)


# --- build -------------------------------------------------------------------------------------


def build(
    months: list[str],
    out_dir: str,
    raw_dir: str,
    skip_download: bool,
    sample_rows: int,
    seed: int,
    ks_threshold: float,
) -> bool:
    """Runs the full pipeline. Returns True on success (KS check passed, budget respected)."""
    month_paths = {m: download_month(m, raw_dir, skip_download) for m in months}

    # Row counts via Parquet metadata only (no data read) so sample allocation across months can
    # be proportional without loading every month into memory at once.
    row_counts = {m: pq.ParquetFile(p).metadata.num_rows for m, p in month_paths.items()}
    total_rows = sum(row_counts.values()) or 1

    hourly_parts: list[pd.DataFrame] = []
    sample_parts: list[pd.DataFrame] = []
    population_subsample_parts: list[pd.Series] = []

    for i, month in enumerate(months):
        df = read_month_slim(month_paths[month])
        hourly_parts.append(aggregate_hourly(df))

        month_target = round(sample_rows * row_counts[month] / total_rows)
        sample_parts.append(stratified_sample(df, month_target, seed=seed + i))

        # A bounded, independent subsample of each month's full PULocationID column, standing in
        # for "the population" in the KS check without holding every month's full column at once.
        population_subsample_parts.append(df["PULocationID"].sample(n=min(len(df), 500_000), random_state=seed + i))

    trips_hourly = pd.concat(hourly_parts, ignore_index=True) if hourly_parts else pd.DataFrame()
    # Re-group across months in case two months' data share an hour bin at a month boundary.
    if not trips_hourly.empty:
        trips_hourly = trips_hourly.groupby(["PULocationID", "pickup_hour"], as_index=False).agg(
            trip_count=("trip_count", "sum"),
            avg_trip_distance=("avg_trip_distance", "mean"),
            avg_total_amount=("avg_total_amount", "mean"),
        )
    trips_sample = pd.concat(sample_parts, ignore_index=True) if sample_parts else pd.DataFrame()
    population_ids = pd.concat(population_subsample_parts, ignore_index=True) if population_subsample_parts else pd.Series(dtype=float)

    zone_lookup_path = download_zone_lookup(raw_dir, skip_download)
    zones = pd.read_csv(zone_lookup_path)

    os.makedirs(out_dir, exist_ok=True)
    trips_hourly.to_parquet(os.path.join(out_dir, "trips_hourly.parquet"), index=False)
    trips_sample.to_parquet(os.path.join(out_dir, "trips_sample.parquet"), index=False)
    zones.to_parquet(os.path.join(out_dir, "zones.parquet"), index=False)

    ks = ks_check(population_ids, trips_sample["PULocationID"], ks_threshold) if not trips_sample.empty else None

    total_bytes = sum(
        os.path.getsize(os.path.join(out_dir, name)) for name in ("trips_hourly.parquet", "trips_sample.parquet", "zones.parquet")
    )
    print(f"trips_hourly: {len(trips_hourly)} rows")
    print(f"trips_sample: {len(trips_sample)} rows")
    print(f"zones: {len(zones)} rows")
    print(f"total size: {total_bytes / (1024 * 1024):.2f} MB (budget: {MAX_TOTAL_BYTES / (1024 * 1024):.0f} MB)")
    if ks is not None:
        print(f"KS check: D={ks.statistic:.4f} p={ks.pvalue:.4f} threshold={ks_threshold} passed={ks.passed}")

    budget_ok = total_bytes <= MAX_TOTAL_BYTES
    ks_ok = ks is None or ks.passed
    if not budget_ok:
        print(f"FAIL: total size {total_bytes} bytes exceeds the {MAX_TOTAL_BYTES}-byte budget", file=sys.stderr)
    if not ks_ok:
        print(f"FAIL: KS statistic {ks.statistic:.4f} exceeds threshold {ks_threshold}", file=sys.stderr)  # type: ignore[union-attr]
    return budget_ok and ks_ok


# --- CLI ----------------------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--months", required=True, help="e.g. 2019-01..2019-06 or 2019-01,2019-02")
    parser.add_argument("--out", default=DEFAULT_OUT_DIR)
    parser.add_argument("--raw-dir", default=DEFAULT_RAW_DIR)
    parser.add_argument("--skip-download", action="store_true", help="reuse files already in --raw-dir")
    parser.add_argument("--sample-rows", type=int, default=2_000_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--ks-threshold", type=float, default=0.02)
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    months = parse_months(args.months)
    ok = build(
        months=months,
        out_dir=args.out,
        raw_dir=args.raw_dir,
        skip_download=args.skip_download,
        sample_rows=args.sample_rows,
        seed=args.seed,
        ks_threshold=args.ks_threshold,
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
