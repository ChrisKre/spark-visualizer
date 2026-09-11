# M6 — Delta file skipping

**Route:** `/m/delta` · **Milestone:** v2.0 · **Status:** planned

The most Databricks-specific module and the one with the cleanest numeric payoff: **bytes
scanned, dropping 40×, with a byte-identical result set.**

## The argument

Delta keeps min/max statistics per column per file in the transaction log. A predicate that falls
outside a file's range means that file is never opened. How well that works depends entirely on
whether rows with similar values were written into the same files — which is what `OPTIMIZE`,
Z-ordering and Liquid Clustering control.

| Layout | Mechanism | Good for |
|---|---|---|
| Partitioned by date | directory pruning, before any file is read | one high-cardinality-but-low-selectivity column, usually a date |
| Z-order | multi-dimensional interleaving within files | 2–4 columns queried together |
| Liquid Clustering | incremental clustering without full rewrites; no partition-column choice to regret | the default recommendation for new tables |
| None | full scan | nothing |

## The small-file problem

Ten thousand 4 MiB files cost more in listing and opening than a hundred 400 MiB files cost in
reading. `OPTIMIZE` compacts them; the target file size is a knob and a real tradeoff, because
larger files skip less precisely.

## Knobs

| Knob | Meaning | Range | Default |
|---|---|---|---|
| `pred` | the query predicate | a date range plus an optional zone filter | last 7 days |
| `zorder` | Z-order columns | none / date / (date, zone) | none |
| `fsize` | `OPTIMIZE` target file size | 16 – 1024 MiB | 128 MiB |
| `layout` | partitioned / Z-ordered / liquid / none | enum | none |

## Visualisation

**Primary — a grid of files**, one cell per file, tinted by its min/max range for the predicate
column. The predicate sweeps across and non-matching files go dark.

Counter, large and persistent: **files read / files skipped / bytes scanned**.

**Secondary — the same query run for real** via DuckDB-WASM over the fat Parquet dataset with
HTTP range requests, printing bytes actually transferred. The `EXECUTED` badge earns its keep
here: the skipping is not simulated, it is measured in the network panel.

## Takeaway

> File skipping is not an optimiser feature you enable. It is a consequence of how the rows were
> physically laid out when they were written. The query does not change; the layout does.

## Fixtures required

Real `OPTIMIZE` and `ZORDER BY` runs on a Delta table, with `DESCRIBE HISTORY` output captured
for the operation metrics (`numFilesAdded`, `numFilesRemoved`, `filesSkipped`), plus the
`SparkListenerSQLExecutionStart` plans showing the pushed filters.

## Acceptance criteria

- [ ] The bytes-scanned counter is driven by real captured `DESCRIBE HISTORY` / scan metrics.
- [ ] The DuckDB pane reports bytes actually transferred, verifiable in devtools.
- [ ] Result-set equality between layouts is asserted on screen — same rows, different cost.
- [ ] Liquid Clustering is presented as the current default recommendation, with the tradeoff
      against Z-order stated rather than hand-waved.
- [ ] The small-file tradeoff is reachable: small `fsize` skips better but lists slower.
