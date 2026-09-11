# M3 — Join strategy selection

**Route:** `/m/joins` · **Milestone:** v1.1 · **Status:** planned

Broadcast hash vs. shuffle hash vs. sort-merge, with the costs **drawn** rather than asserted —
including the case everyone gets wrong: when broadcast is the worse choice.

## The argument

| Strategy | What it costs | When it wins |
|---|---|---|
| `BroadcastHashJoin` | driver collects the small side, then ships it to **every** executor: `size × N` bytes on the wire, plus driver heap | small side genuinely small, cluster not enormous |
| `ShuffledHashJoin` | one exchange, then a hash table per partition — no sort | one side fits in execution memory per partition |
| `SortMergeJoin` | two exchanges plus a sort on both sides; sort dominates | both sides large; the only one that always works |

The trap: a 200 MiB dimension broadcast to a 100-executor cluster puts 20 GiB on the network and
can OOM the driver during the collect — while the sort-merge everyone is trying to avoid would
have finished. The module makes that crossover point draggable.

## Knobs

| Knob | Config key | Range | Default |
|---|---|---|---|
| `dim` | dimension-table size | 1 MiB – 4 GiB, log scale | 8 MiB |
| `bt` | `spark.sql.autoBroadcastJoinThreshold` | −1 (off) – 1 GiB | 10 MiB |
| `ex` | `spark.executor.instances` | 2 – 200 | 8 |
| `drv` | `spark.driver.memory` | 1 – 32 GiB | 8 GiB |

## Visualisation

Three lanes, one clock, running the same join side by side. Each lane carries its own
**bytes-on-wire** counter and its own outcome badge (`done` / `spilled` / `driver OOM`).

The crossover chart beneath: dimension size on x, wall clock on y, one line per strategy, with
the current `dim` value marked. Where the lines cross is the lesson.

## Metric ribbon

`wall clock · bytes on wire · driver peak heap · executor peak exec memory · outcome`

## Takeaway

> Broadcast is not "the fast join". It is a trade: you pay `size × executors` in network and
> driver heap to avoid a shuffle. On a small cluster with a small dimension that trade is free.
> On a hundred-node cluster with a 200 MiB dimension it is twenty gigabytes and a dead driver.

## Fixtures required

`m3_bhj_small`, `m3_bhj_toolarge`, `m3_shj`, `m3_smj`, `m3_driver_oom`, plus a size sweep of four
runs for the crossover chart.

## Acceptance criteria

- [ ] Three lanes animate on one shared clock and one shared scale.
- [ ] Driver OOM is reachable and renders as a **failure**, not a large number.
- [ ] `bt = -1` correctly disables broadcast entirely.
- [ ] The crossover chart marks the current configuration and both crossing points.
