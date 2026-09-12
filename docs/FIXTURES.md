# Fixtures: capture, reduce, calibrate

Fixtures are what make this project credible. They are real Spark event logs from real runs,
reduced to a few hundred kB and committed. You need a cluster **once per fixture**, never to
develop the app.

## 1. Why the event log is enough

The Spark UI is a renderer over a line-delimited JSON event log. Every number the UI shows comes
from `SparkListener` events. So a captured log contains the entire truth of a run — task
durations, spill, GC, shuffle bytes, the physical plan and its per-node accumulators. There is
nothing extra to be gained from a live History Server, and embedding one would require a
backend.

## 2. Capture

Any cluster works: local Docker Spark, Databricks free edition, one spot node. What matters is
that the shape is realistic and the configuration is recorded.

```python
# tools/capture/00_configure.py
spark.conf.set("spark.eventLog.enabled", "true")
spark.conf.set("spark.eventLog.dir", "dbfs:/tmp/spark-events")
spark.conf.set("spark.sql.adaptive.logLevel", "INFO")   # logs each AQE plan change
```

Run the scenario twice — once as the pathology, once as the fix — with everything else held
constant. A fixture **pair** is the unit of work, because the product is a before/after
comparison.

```python
# tools/capture/m1_skew.py
run("m1_skew_before", alpha=1.6, salt=1)
run("m1_skew_after",  alpha=1.6, salt=8)
```

Record the environment in the same commit: Spark version, DBR version, node type, node count,
executor memory and cores, and the exact config diff between the two runs. This goes into the
fixture header and is displayed in the UI.

## 3. Reduce

Raw logs are tens of MB. Fixtures must be **≤ 400 kB gzipped**.

```python
# tools/capture/10_reduce.py
events = spark.read.json("dbfs:/tmp/spark-events/app-2026*")

tasks = (events.where("Event = 'SparkListenerTaskEnd'")
    .select(
        "`Stage ID`",
        "`Task Info`.`Task ID`",
        "`Task Info`.`Launch Time`",
        "`Task Info`.`Finish Time`",
        "`Task Info`.`Executor ID`",
        "`Task Metrics`.`Executor Run Time`",
        "`Task Metrics`.`Executor Deserialize Time`",
        "`Task Metrics`.`JVM GC Time`",
        "`Task Metrics`.`Memory Bytes Spilled`",
        "`Task Metrics`.`Disk Bytes Spilled`",
        "`Task Metrics`.`Peak Execution Memory`",
        "`Task Metrics`.`Shuffle Read Metrics`.*",
        "`Task Metrics`.`Shuffle Write Metrics`.*",
    ))

tasks.coalesce(1).write.mode("overwrite").json("fixtures/_raw/m1_skew_before")
```

Plan-level numbers live in the same log, elsewhere:

- `SparkListenerSQLExecutionStart` — the physical plan string and its node ids.
- `SparkListenerDriverAccumUpdates` — per-node accumulators: *number of output rows*,
  *spill size*, *shuffle bytes written*. Joining these two reconstructs the annotated plan tree
  that module M2 animates.
- AQE plan changes appear in the driver log when `spark.sql.adaptive.logLevel=INFO`, and as
  `SparkListenerSQLAdaptiveExecutionUpdate` events.

### Reduction rules

1. Keep every task record. Task-level texture — deserialisation jitter, a GC pause landing on an
   unlucky task, a straggler that is *not* the biggest partition — is exactly what the simulator
   cannot reproduce and what a reviewer will recognise. **Never smooth it.**
2. Drop executor heartbeats, block-manager events, and anything environment-scoped except the
   config snapshot.
3. Round byte counts to the nearest KiB and times to the nearest ms.
4. Above ~10,000 tasks, downsample by keeping all tasks in the slowest and fastest deciles and a
   uniform sample of the middle, recording `samplingRatio` in the header so the UI can say so.

## 4. Fixture format

```jsonc
// packages/fixtures/data/m1_skew_before.json
{
  "id": "m1_skew_before",
  "schemaVersion": 1,
  "captured": "2026-09-14",
  "environment": {
    "sparkVersion": "3.5.0",
    "runtime": "DBR 14.3 LTS",
    "nodes": 8, "nodeType": "i3.xlarge",
    "executorMemoryMiB": 8192, "coresPerExecutor": 4
  },
  "config": { "zipfAlpha": 1.6, "saltFactor": 1, "shufflePartitions": 200, "aqe": false },
  "pairedWith": "m1_skew_after",
  "notes": "NYC TLC 2019-01..2019-06, join on PULocationID",
  "sampling": { "ratio": 1.0 },
  "stages": [ /* … */ ],
  "tasks":  [ /* … */ ],
  "plan":   { /* … */ }
}
```

`packages/fixtures/schema.ts` validates every fixture at build time with Zod. A fixture that
fails validation fails CI.

**Schema extensions beyond the sketch above** (SAS-022):

- `runConfig` — the literal `RunConfig` used to produce the run, alongside the smaller
  display-only `config` block shown above. `calibrate.py` and the calibration MAE gate need the
  full config (memory fractions, row counts, query shape) to reconstruct costs, not just the 4
  display fields.
- `synthetic` — `true` for a fixture produced by `packages/fixtures/scripts/generate-synthetic.ts`
  rather than captured from a real cluster. Defaults to `false`. `packages/fixtures/resolve.ts`'s
  snapping index excludes every fixture with `synthetic: true`, so a synthetic fixture can never
  make the UI show `MEASURED` — enforced in code, not just by convention.
- Each task also carries `rows: number` — a fixtures-schema-only field (not part of `TaskResult`)
  that `calibrate.py`'s per-task regression needs for the `computeMs`/`sortMs` terms.
  `packages/fixtures/loader.ts` strips it when building a `RunResult`.
- `plan` matches `RunResult['plan']` exactly (`{ initial: PlanNode, final: PlanNode, rewrites:
  AqeRewrite[] }`), not a single free-form tree — a fixture must be able to fully substitute for a
  measured `RunResult`.

**Until a real capture session lands** (see the sequencing note in
[BACKLOG.md](../BACKLOG.md#e3--fixture--calibration-pipeline)), every fixture committed under
`packages/fixtures/data/` is synthetic: generated from `packages/sim`'s own `simulate()` plus
injected per-task jitter, not a real Spark capture. Regenerate them with
`pnpm --filter @sas/fixtures run generate:synthetic`.

## 5. Coverage requirement

Per module, capture **5–8 runs spanning the parameter range**, not just the two endpoints. The
in-between runs are what the calibration fits against and what the snapping uses.

M1 example grid:

| Run | `zipfAlpha` | `saltFactor` | Purpose |
|---|---|---|---|
| `m1_a00_s1` | 0.0 | 1 | uniform baseline |
| `m1_a08_s1` | 0.8 | 1 | mild skew |
| `m1_a12_s1` | 1.2 | 1 | visible straggler |
| `m1_a16_s1` | 1.6 | 1 | **the hero "before"** |
| `m1_a16_s4` | 1.6 | 4 | partial fix |
| `m1_a16_s8` | 1.6 | 8 | **the hero "after"** |
| `m1_a16_null3` | 1.6 | 1 | 3 % null keys, no salt — the trap |
| `m1_a20_s8` | 2.0 | 8 | salting is not enough |

## 6. Calibration

```bash
python tools/capture/calibrate.py --fixtures packages/fixtures/data --out packages/sim/calibration/constants.generated.ts
```

Least-squares fit of the simulator constants against measured stage wall clock across all
fixtures. Outputs the constants file with a provenance header and a residual report:

```
Fitted 9 constants against 34 runs.
  stage wall clock   MAE  7.8 %   R² 0.94
  disk bytes spilled MAE 11.2 %   R² 0.89
  jvm gc time        MAE 18.6 %   R² 0.71   ← worst; documented as a known weakness
```

**CI gate:** stage wall-clock MAE must stay ≤ 12 %. If a change to the model moves it, the PR
description must say by how much and why.

The residual chart is rendered in the UI on `/about` and in the README. It is the most senior
artefact in the repository — an architect will ask for exactly this before trusting anyone else's
simulator.

## 7. Honesty rules

1. A panel shows `MEASURED` only when a fixture was actually used. No exceptions.
2. Publish the raw reduced log for download next to every module.
3. Put a screenshot of the same stage in the real Spark UI beside our rendering. Side-by-side
   proof beats an iframe that needs a server.
4. Where the model is weak (GC, currently), say so in the UI rather than hiding it.
