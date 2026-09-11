# M2 — Adaptive Query Execution

**Route:** `/m/aqe` · **Milestone:** v1.0 (coalescing + skew join), v1.1 (dynamic join switch)
**Status:** in backlog

The strongest single moment on the site: the DAG rewriting itself mid-run. People have read about
AQE; almost nobody has watched it happen.

## 1. The setup

> The same taxi aggregation, but the optimiser guessed wrong at planning time. Statistics said
> the dimension side was 6 GiB. After the first stage materialises, it turns out to be 6 MiB.
> With AQE off, Spark honours its bad guess for the whole query.

## 2. The three rules, in the order they fire

| Rule | Trigger | Visible effect |
|---|---|---|
| `optimizeSkewedJoin` | partition > `skewedPartitionThresholdMiB` (256) **and** > `skewedPartitionFactor` (5) × median | the fat partition splits into sub-tasks; the matching side replicates |
| `coalesceShufflePartitions` | mean post-shuffle partition < `advisoryPartitionSizeMiB` (64) | 200 partitions merge down to 17; 183 task launches disappear |
| `dynamicJoinSelection` | materialised side ≤ `autoBroadcastJoinThresholdMiB` (10) | `SortMergeJoin` → `BroadcastHashJoin`; one `Exchange` and both `Sort` nodes vanish |

Order is fixed and must match the simulator ([SIMULATOR_SPEC §3.3](../SIMULATOR_SPEC.md)).

## 3. Knobs

| Knob | Config key | Range | Default |
|---|---|---|---|
| `aqe` | `spark.sql.adaptive.enabled` | on / off | on |
| `adv` | `spark.sql.adaptive.advisoryPartitionSizeInBytes` | 8 – 256 MiB | 64 MiB |
| `skf` | `spark.sql.adaptive.skewJoin.skewedPartitionFactor` | 2 – 10 | 5 |
| `est` | planner size estimate error, ×0.001 – ×1000 | log scale | ×1000 (badly over-estimated) |

`est` is the knob that makes the dynamic join switch demonstrable — it is not a Spark config, it
stands in for stale or missing table statistics, and the UI labels it as such rather than dressing
it up as a real setting.

## 4. Visualisation

**Primary — the plan tree.** SVG, laid out top-down. When a rewrite fires, the affected subtree
animates: outgoing nodes fade and collapse, incoming nodes expand into place, and a labelled
annotation names the rule (`AQE: coalesced 200 → 17 partitions`). The rewrite happens **at the
correct point on the virtual clock** — after the producing stage materialises, not at t=0.

**Secondary — the partition strip.** A one-row strip of 200 cells above the timeline showing
partitions merging into 17. Cheap to build, and it makes coalescing legible in a way the plan
tree alone does not.

**Tertiary — the task timeline** (shared component with M1), so the reader sees 183 task launches
disappear.

## 5. Metric ribbon

Same six metrics as M1, plus **task count** — because the headline win from coalescing is the
tasks that never launch.

## 6. The comparison that matters

Run the identical query twice, AQE off and AQE on, on one clock. The plan on the left stays
frozen; the plan on the right rewrites itself twice while the reader watches. Same query, same
data, same cluster.

## 7. Code pane

**Config tab**

```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "64MB")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")
spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes", "256MB")
spark.conf.set("spark.sql.adaptive.logLevel", "INFO")   # so plan changes are logged
```

**EXPLAIN tab** — the initial plan, then the `AdaptiveSparkPlan` with
`isFinalPlan=true` from the captured run. The `== Physical Plan ==` blocks are real output, not
prose about them.

## 8. Takeaway copy

> AQE does not make Spark smarter at planning time. It makes Spark willing to change its mind
> once a stage has actually run and the real sizes are known. Every one of its three tricks is a
> reaction to a statistic the planner could not have had.

## 9. Fixtures required

| Fixture | Config |
|---|---|
| `m2_off` | AQE off, bad estimate |
| `m2_coalesce_only` | AQE on, coalesce only, no skew, accurate estimate |
| `m2_skew_split` | AQE on, skew join fires |
| `m2_join_switch` | AQE on, SMJ → BHJ switch fires |
| `m2_all` | all three fire — the hero run |
| `m2_adv8`, `m2_adv256` | advisory size at both ends, for calibration |

## 10. Acceptance criteria

- [ ] Each rewrite animates at the correct clock position, after its producing stage completes.
- [ ] Every rewrite emits a labelled annotation naming the rule and the concrete change.
- [ ] Turning `aqe` off freezes the plan — no rewrites, and the metric ribbon shows the cost.
- [ ] Plan tree is readable at 400 px (it may scroll horizontally in its own container).
- [ ] The `est` knob is visibly labelled as a stand-in for table statistics, not a Spark config.
- [ ] `EXPLAIN` tab content is verbatim captured output, byte-for-byte.
- [ ] v1.0 ships with coalescing and skew join; the dynamic join switch may be behind a
      "coming in v1.1" state, but must not be faked.
