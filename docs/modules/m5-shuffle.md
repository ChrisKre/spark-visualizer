# M5 — Shuffle mechanics

**Route:** `/m/shuffle` · **Milestone:** v3.0 · **Status:** planned

What actually crosses the wire. The lowest-priority of the six: a particle field is pretty but
diffuse, and most of its lessons are already carried by M1 and M2.

## The argument

Each of *M* map tasks writes one output file partitioned into *R* buckets. Each of *R* reduce
tasks then fetches its bucket from all *M* map outputs — `M × R` fetches. That product, not the
data volume, is what makes shuffle expensive at high partition counts.

## The three lessons

1. **`repartition` vs `coalesce`.** `repartition(n)` is a full exchange. `coalesce(n)` merges
   partitions locally without one — and therefore cannot increase the partition count, and can
   leave you with skew it refuses to fix.
2. **Low cardinality wastes reducers.** 200 shuffle partitions and 12 distinct keys means 188
   reducers receive nothing and 12 do all the work.
3. **`M × R` has a cost of its own.** Raising `shuffle.partitions` to 4,000 to "spread the load"
   can make the job slower purely through fetch overhead, before a single byte is processed.

## Knobs

| Knob | Config key | Range | Default |
|---|---|---|---|
| `sp` | `spark.sql.shuffle.partitions` | 8 – 4000, log scale | 200 |
| `card` | distinct key count | 2 – 100,000, log scale | 500 |
| `op` | `repartition` / `coalesce` | toggle | repartition |

## Visualisation

Canvas particle field across the `M × R` grid: map outputs on the left, reducers on the right,
particles flowing along fetch paths, thickness proportional to bytes. Idle reducers stay visibly
empty.

The payoff metric is **fetch wait time** — executors idle waiting on the network rather than
computing.

## Takeaway

> Shuffle cost is not one number. It is bytes on the wire, plus `M × R` fetch requests, plus the
> sort that usually accompanies it. Raising the partition count reduces the first and increases
> the second, which is why there is an optimum rather than a direction.

## Acceptance criteria

- [ ] The `M × R` cost is visible as a distinct contributor, not folded into byte volume.
- [ ] `coalesce` correctly draws **no** exchange and cannot raise the partition count.
- [ ] Idle reducers are countable on screen at low cardinality.
- [ ] Canvas holds 60 fps at `sp = 4000` on a mid-range laptop, or degrades explicitly.
