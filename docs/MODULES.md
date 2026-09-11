# Modules

Six modules, selected on three axes: how legible the mechanism is as a picture, how often it
decides a real interview, and how cheap it is to simulate faithfully. Everything else is a blog
post.

| ID | Module | Milestone | Spec | Status |
|---|---|---|---|---|
| `m0` | Lazy evaluation & stage boundaries (primer) | v1.1 | [m0-primer.md](./modules/m0-primer.md) | planned |
| `m1` | Data skew & salting | **v1.0** | [m1-skew.md](./modules/m1-skew.md) | in backlog |
| `m2` | Adaptive Query Execution | **v1.0** (partial) | [m2-aqe.md](./modules/m2-aqe.md) | in backlog |
| `m3` | Join strategy selection | v1.1 | [m3-joins.md](./modules/m3-joins.md) | planned |
| `m4` | Unified memory & spill | v2.0 | [m4-memory.md](./modules/m4-memory.md) | planned |
| `m5` | Shuffle mechanics | v3.0 | [m5-shuffle.md](./modules/m5-shuffle.md) | planned |
| `m6` | Delta file skipping | v2.0 | [m6-delta.md](./modules/m6-delta.md) | planned |

## Anatomy of a module

Every module has the same seven parts. A module is not done until all seven exist.

1. **The setup** — one paragraph of domain framing. A real query on real data with a real goal.
2. **The knobs** — 2–4, never more. Each shows its actual Spark config key.
3. **The visualisation** — one primary chart that carries the argument, at most one secondary.
4. **The metric ribbon** — always visible, always the same metrics in the same order.
5. **The before/after** — two panes, one clock, one scale.
6. **The code pane** — Diff / Config / EXPLAIN tabs, real output from the captured run.
7. **The takeaway** — two or three sentences a reader could repeat in an interview.

## Why these six

| Module | Picture legibility | Interview frequency | Simulation cost |
|---|---|---|---|
| m1 skew | very high — one bar dwarfs 199 others | very high | low |
| m2 AQE | very high — the plan visibly rewrites itself | high, and rising | medium |
| m3 joins | high — three lanes, one clock | very high | low |
| m4 memory | high — a stacked bar with a moving boundary | medium | high (the spill model is the hard part) |
| m5 shuffle | medium — a particle field is pretty but diffuse | medium | medium |
| m6 delta | very high — files go dark, a counter drops | high for Databricks roles | low |

m1 first because it has the highest ratio of impact to cost, and because it proves the whole
engine: partition sizing, task generation, scheduling, the metric ribbon and the comparison view.
Once m1 works, every other module is composition.

## Naming

Route: `/m/<slug>` where slug is `skew`, `aqe`, `joins`, `memory`, `shuffle`, `delta`.
Module id in code is `m1`…`m6`. Fixture ids are prefixed with the module id.
