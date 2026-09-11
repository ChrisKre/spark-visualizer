# M4 — Unified memory & spill

**Route:** `/m/memory` · **Milestone:** v2.0 · **Status:** planned

The cliff-edge module. Nudge executor memory down 15 % and runtime goes up 9×. Non-linear
response is what makes tuning feel real, and it is why a table of config values never teaches it.

## The arithmetic, at defaults

An 8 GiB executor heap, `spark.memory.fraction 0.6`, `spark.memory.storageFraction 0.5`:

```
heap                8192 MiB
− reserved           300 MiB          (hard-coded in Spark, not configurable)
= usable            7892 MiB
unified  = 0.6 ×    7892 = 4735 MiB   ← execution + storage share this
user     = 0.4 ×    7892 = 3157 MiB   ← your own objects, UDF closures, etc.
storage floor = 0.5 × 4735 = 2368 MiB ← storage is protected only down to here
```

## The asymmetry — this is the whole module

**Execution can evict cached storage blocks down to the storage floor. Storage can never evict
execution.**

So a wide aggregation quietly destroys the `df.cache()` someone added for speed, the cache
silently recomputes, and the job gets *slower* the more you cache. This must be modelled
explicitly in the simulator, not approximated.

## The four regimes on one slider

Drag `spark.executor.memory` down and the sequence fires in order:

| Regime | What happens | Ribbon signal |
|---|---|---|
| 1. Comfortable | everything fits | spill 0, GC < 5 % |
| 2. Borrowing | execution takes unified space from storage | cached fraction drops |
| 3. Evicting | cached blocks are dropped and recomputed | recompute count climbs |
| 4. Spilling | sort buffers go to disk, then merge | disk spilled > 0, wall clock jumps |
| 5. Thrashing / OOM | GC dominates, then the task dies | GC % > 30, then `OutOfMemoryError` |

Four visibly different regimes on one control. The transition between 3 and 4 is the cliff.

## Knobs

| Knob | Config key | Range | Default |
|---|---|---|---|
| `mem` | `spark.executor.memory` | 1 – 32 GiB | 8 GiB |
| `mf` | `spark.memory.fraction` | 0.3 – 0.9 | 0.6 |
| `sf` | `spark.memory.storageFraction` | 0.1 – 0.9 | 0.5 |
| `cache` | how much the job caches | 0 – 8 GiB | 2 GiB |

## Visualisation

**Primary — a live stacked memory bar per executor.** Reserved / execution / storage / user, with
the borrow boundary physically moving as the stage runs, and evicted blocks visibly dropping out.

**Secondary — the spill counter and a disk-write trace**, so spill reads as an *event* on the
timeline rather than a number in a corner.

## Takeaway

> Spark does not have an execution memory setting and a cache memory setting. It has one pool
> that execution is allowed to take from and caching is not. If your job is slow and your cache
> hit rate is mysteriously bad, those are the same fact.

## Fixtures required

A memory sweep of 6–8 runs from comfortable to OOM at fixed data size, plus a cache-size sweep of
three. This module has the **highest simulation cost** of the six — expect the spill model to need
two calibration rounds.

## Acceptance criteria

- [ ] All five regimes reachable with the four knobs and visibly distinct.
- [ ] OOM renders as a failed stage. The number is not clamped to something plausible.
- [ ] The storage-eviction asymmetry is demonstrable: raise `cache`, watch execution take it back.
- [ ] The memory bar arithmetic matches [SIMULATOR_SPEC §4](../SIMULATOR_SPEC.md) exactly,
      including the 300 MiB reserved region.
