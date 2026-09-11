# M1 — Data skew & salting

**Route:** `/m/skew` · **Milestone:** v1.0 · **Status:** in backlog

The flagship module. Everything else is composition on top of what this one establishes.

## 1. The setup

> Six months of NYC taxi trips, joined to the zone lookup, aggregated by pickup zone. 84 million
> rows, 200 shuffle partitions, an 8-node cluster. The job takes six and a half minutes, and 199
> of the 200 tasks are finished in the first nine seconds.

## 2. The argument

A stage ends when its **slowest** task ends, not when the work is done. Salting costs about 4 %
more total CPU and returns 7.5× on wall clock.

| | Before | After (salt 8) |
|---|---|---|
| Largest partition | 4.2 GiB | 560 MiB |
| Mean partition | 500 MiB | 500 MiB |
| Straggler ratio | 48.2 | 1.4 |
| Stage wall clock | 6m 21s | 51s |
| CPU-seconds | 1,840 | 1,910 |

These figures come from fixtures `m1_a16_s1` and `m1_a16_s8`, not from the model.

## 3. Knobs

| Knob | Config key / meaning | Range | Default | Snap ε |
|---|---|---|---|---|
| `a` | `zipfAlpha` — tail heaviness of the join key | 0 – 2.2, step 0.1 | 1.6 | 0.05 |
| `salt` | salt factor N in the rewrite | 1 – 16, step 1 | 1 | exact |
| `nulls` | null fraction on the join key | 0 – 0.15, step 0.01 | 0 | exact |
| `ex` | `spark.executor.instances` | 2 – 32 | 8 | exact |

`sp` (`spark.sql.shuffle.partitions`, default 200) is exposed as an advanced knob behind a
disclosure, so the primary control set stays at four.

## 4. Visualisation

**Primary — partition-size histogram.** 200 bars, descending, before and after on one shared
scale. The tall bar is the whole argument; it carries an annotation (`4.2 GiB in one partition`)
and a leader line, and it is labelled in text as well as colour.

**Secondary — task timeline (Canvas Gantt).** 200 task bars across `executors × cores` slots on
the shared virtual clock. The straggler is visibly alone on its slot while every other slot has
gone idle. Hovering a bar shows task id, partition id, duration, shuffle read bytes, spill.

Both read the same `clock.t`. Playing the timeline and watching the histogram at the same moment
is the "aha".

## 5. Metric ribbon

`wall clock · CPU-s · straggler ratio · shuffle read · disk spilled · GC %`

In compare mode, three columns with a signed delta. **Watch the CPU-s column stay flat while
wall clock explodes** — that contrast is the teaching payload, so CPU-s must never be hidden on
narrow screens.

## 6. The three states worth reaching

| State | How to get there | What it shows |
|---|---|---|
| Healthy | `a = 0` | 200 even bars, every slot busy, no straggler |
| Skewed | `a = 1.6`, `salt = 1` | the hero "before" |
| Salted | `a = 1.6`, `salt = 8` | the hero "after" |
| **The null trap** | `a = 0`, `nulls = 0.03` | a *perfectly uniform* business key still produces a brutal straggler, because every null hashes to one partition. Salting does not fix it; a filter does. |

The null trap is the module's best moment for an experienced reader. Give it its own preset
button labelled "Try: 3 % null keys".

## 7. Code pane

**Diff tab**

```python
# before
orders.join(zones, orders.PULocationID == zones.LocationID)

# after — salt the skewed side, explode the other
SALT = 8
orders_salted = orders.withColumn(
    "salted_key",
    F.concat_ws("_", F.col("PULocationID"), (F.rand() * SALT).cast("int")))

zones_exploded = (zones
    .withColumn("salt", F.explode(F.array([F.lit(i) for i in range(SALT)])))
    .withColumn("salted_key", F.concat_ws("_", F.col("LocationID"), F.col("salt"))))

orders_salted.join(zones_exploded, "salted_key")
```

**Config tab** — the exact `spark.conf` diff between the two captured runs.

**EXPLAIN tab** — real `df.explain("formatted")` output from both runs, side by side.

## 8. Takeaway copy

> A stage finishes when its slowest task finishes. Skew does not make the cluster do more work —
> it makes one machine do all of it while the rest go idle. Salting trades a few percent of CPU
> for a redistribution of that work, and the only number that moves is the one you are paid for:
> wall clock.

## 9. Fixtures required

`m1_a00_s1`, `m1_a08_s1`, `m1_a12_s1`, `m1_a16_s1`, `m1_a16_s4`, `m1_a16_s8`, `m1_a16_null3`,
`m1_a20_s8` — the grid in [FIXTURES.md §5](../FIXTURES.md#5-coverage-requirement).

## 10. Acceptance criteria

- [ ] The four knobs drive a recomputation under 16 ms; dragging stays at 60 fps.
- [ ] Histogram and timeline share one clock and one scale across both panes.
- [ ] Badge flips to `MEASURED` at each fixture point and `MODELED` between them.
- [ ] Permalink round-trips all four knobs plus compare mode and clock position.
- [ ] The null-trap preset is reachable in one click and its copy explains the fix is a filter.
- [ ] Works at 400 px: the histogram stays readable, the timeline may degrade to a final frame.
- [ ] Axe reports no serious or critical violations; the timeline has a keyboard-navigable
      task list equivalent.
