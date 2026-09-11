# M0 — Lazy evaluation & stage boundaries (primer)

**Route:** `/m/primer` · **Milestone:** v1.1 · **Status:** planned

Sixty seconds of onboarding. Every later module reuses this vocabulary, and without it the DAG
animations land on nobody. Cheap to build — build it *second*, after M1 proves the engine.

## The argument

Narrow transformations chain inside one stage because each output partition depends on exactly
one input partition. A wide transformation needs data from every input partition, so Spark must
write a shuffle, end the stage, and start a new one. **Stage boundaries are shuffle boundaries.**
That is the entire model.

## Knobs

| Knob | Meaning | Range |
|---|---|---|
| `ops` | the transformation chain the user assembles | drag-and-drop from a palette of `filter`, `select`, `withColumn`, `groupBy`, `join`, `repartition`, `orderBy` |

The user builds a chain; the DAG re-segments live, showing where stages break and why.

## Visualisation

A horizontal chain of operator chips. Narrow ops sit inside a shaded stage band; dropping a wide
op splits the band and draws the exchange. A running count: **stages: 3 · exchanges: 2**.

## Takeaway

> `filter`, `select` and `withColumn` are free to chain — they never move a row between machines.
> `groupBy`, `join`, `orderBy` and `repartition` are not: each one ends a stage, writes every row
> to disk, and reads it back over the network. Count the exchanges in your plan and you have
> counted the expensive parts of your job.

## Acceptance criteria

- [ ] Dropping a wide operator visibly splits the stage band and adds an exchange.
- [ ] `coalesce` is in the palette and correctly does **not** create an exchange — this is the
      one contrast the module exists for beyond the basics.
- [ ] Reachable in under 60 seconds from a cold load, with no reading required.
