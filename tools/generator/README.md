# tools/generator

The synthetic skew-data generator, implemented twice — TypeScript (for the in-app slider
path) and PySpark (for producing real Parquet fixtures) — with a parity test (SAS-032)
asserting both implementations agree on key-frequency histograms within 0.5%.

Not yet a pnpm workspace member. The TypeScript half will likely need `@sas/sim`'s Zipf
implementation once SAS-031 lands (E4) — revisit workspace membership then.
