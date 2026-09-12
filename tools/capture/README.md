# tools/capture

PySpark jobs that turn a real cluster run into a committed fixture. Pure Python — deliberately
**not** a pnpm workspace member. Not part of CI (`docs/TECH_STACK.md`: "Capture side... Fixture
generation only, run manually.").

## SAS-020 — capture environment decision

**Recommendation: local Docker Spark 3.5.**

| Option | Cost | Setup | Realism |
|---|---|---|---|
| **Local Docker Spark 3.5 (chosen)** | free | `docker run`, no account | single JVM shares one machine's CPU/disk/network — weaker shuffle-over-network straggler effects than a real multi-node cluster, but the event log format, task metrics, and AQE behaviour are identical |
| Databricks free edition | free tier, usage-limited | account signup | closest to the DBR 14.3 LTS runtime the docs reference; real multi-node network effects |
| Single spot node | small real spend | cloud account | real cloud node, but still single-node — no genuine network-shuffle realism either |

Local Docker Spark wins on cost and reproducibility (anyone can re-run a capture session with no
account), at the cost of understating pure network-fetch stragglers — a caveat worth a line in
`docs/calibration-report.md` once real fixtures land, alongside the GC caveat FIXTURES.md already
documents.

### Environment block every fixture must carry

Every fixture's `environment` field (`packages/fixtures/schema.ts`'s `EnvironmentSchema`) records
exactly this, filled in at capture time:

```jsonc
{
  "sparkVersion": "3.5.0",
  "runtime": "Docker apache/spark:3.5.0",
  "nodes": 1,
  "nodeType": "local-docker",
  "executorMemoryMiB": 8192,
  "coresPerExecutor": 4
}
```

### How to actually run this later

Not validated against a live cluster in this pass — sketch only, for the real-cluster follow-up:

```bash
docker run --rm -it \
  -v "$(pwd)/tools/capture:/capture" \
  -v "$(pwd)/tools/capture/_events:/tmp/spark-events" \
  apache/spark:3.5.0 \
  /opt/spark/bin/spark-submit /capture/m1_skew.py
```

then run `10_reduce.py` against `_events/` to produce the committed fixture JSON.

### Follow-up (real cluster)

SAS-023 (M1 grid, 8 runs) and SAS-024 (M2 grid, 7 runs) should target this Docker Spark 3.5
environment. Until that session runs, `packages/fixtures/data/*.json` holds **synthetic**
stand-ins (`synthetic: true` on every one — see SAS-023/024 below) generated from
`packages/sim`'s own `simulate()`, not real captures. Running the real session replaces those
files 1:1 by id and re-runs `calibrate.py`.

## SAS-021 — the three scripts

- `00_configure.py` — sets `spark.eventLog.enabled`/`dir`/`adaptive.logLevel=INFO`.
- `m1_skew.py`, `m2_aqe.py` — scenario runners for the M1 (8-run) and M2 (7-run) grids
  (`docs/FIXTURES.md` §5, `docs/modules/m2-aqe.md` §9). Generate data inline via plain
  `spark.range`/`F.rand` rather than importing `tools/generator` — SAS-021's declared dependency
  SAS-030 (E4's PySpark generator) doesn't exist yet; swap this for `tools.generator.skew` once
  E4 lands.
- `10_reduce.py` — a dependency-free core (pure functions implementing the four reduction rules)
  plus a thin PySpark CLI wrapper. **The reduction logic is unit-tested against
  `testdata/sample_event_log.jsonl` — see `test_reduce.py`** — because there is no cluster to
  validate against for real yet.

`requirements.txt` pins the Python dependencies (`pyspark`, `numpy`) for running these scripts and
`calibrate.py` locally.
