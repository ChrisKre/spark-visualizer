# Shuffle & Spill

An interactive teaching instrument for Apache Spark internals. You *cause* the pathology —
skew, spill, a broadcast that should have been a sort-merge — watch the stage timeline deform,
then fix it and watch wall clock collapse.

A blog post tells you the p99 partition is the problem. This hands over the controls that
produced it.

**Live:** [spark-visualizer-web-nine.vercel.app](https://spark-visualizer-web-nine.vercel.app/) · **Status:** pre-MVP, see [BACKLOG.md](./BACKLOG.md)

---

## The one idea you need before reading anything else

Spark cannot run in a browser. PySpark is a thin Py4J client to a JVM system, and there is no
WebAssembly JVM path worth taking. So this project **never executes Spark on the client**.
Instead it uses three clearly separated layers, and labels which one is on screen at all times:

| Layer | What it is | What it answers | Badge |
|---|---|---|---|
| **MEASURED** | Real Spark event logs from real cluster runs, reduced to committed JSON fixtures | "Did you actually run Spark?" | `MEASURED` |
| **MODELED** | A deterministic TypeScript cost model, constants fitted to the measured layer | "What if I turn skew up?" | `MODELED` |
| **EXECUTED** | DuckDB-WASM running real SQL over real Parquet in the user's tab | "Is the query pane fake?" | `EXECUTED` |

Every metric panel carries its badge. Admitting where the model takes over is the cheapest
credibility move in the project — see [ADR-0003](./docs/adr/0003-replay-plus-simulate.md).

---

## Repository map

```
.
├── README.md                  you are here
├── BACKLOG.md                 epics, tickets, acceptance criteria, milestones
├── docs/
│   ├── ARCHITECTURE.md        layers, packages, rendering budget, data flow
│   ├── TECH_STACK.md          every dependency and why it is there
│   ├── SIMULATOR_SPEC.md      the TypeScript cost model, normative
│   ├── FIXTURES.md            event-log capture → fixture → calibration pipeline
│   ├── DATA_PIPELINE.md       datasets, slim Parquet build, synthetic generator
│   ├── APP_STATE.md           store shape, virtual clock, URL serialisation
│   ├── DESIGN_SYSTEM.md       tokens, type scale, chart rules, copy voice
│   ├── MODULES.md             the six modules, scope and status
│   ├── modules/               one normative spec per module
│   ├── CONTRIBUTING.md        workflow, conventions, definition of done
│   ├── ROADMAP.md             v1.0 → v3.0
│   ├── GLOSSARY.md            Spark terms used throughout, defined once
│   └── adr/                   architecture decision records
├── apps/web/                  Next.js static-export app
├── packages/sim/              the deterministic simulator (framework-free)
├── packages/viz/              chart primitives (SVG + Canvas)
├── packages/fixtures/         committed event-log fixtures + loader
├── tools/capture/             PySpark jobs that produce fixtures
└── tools/generator/           synthetic skew generator (TS + PySpark, same seed)
```

## Quickstart

```bash
pnpm install
pnpm dev            # apps/web on :3000
pnpm test           # vitest, includes simulator golden tests
pnpm build          # static export to apps/web/out
```

Capturing new fixtures needs a Spark cluster — see [docs/FIXTURES.md](./docs/FIXTURES.md).
You do **not** need one to develop the app; fixtures are committed.

## Where to start as a new contributor

1. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/SIMULATOR_SPEC.md](./docs/SIMULATOR_SPEC.md).
2. Skim [docs/GLOSSARY.md](./docs/GLOSSARY.md) if Spark vocabulary is new to you.
3. Pick a ticket from [BACKLOG.md](./BACKLOG.md) — start with anything labelled `good-first`.
4. Read [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) before opening a PR.

## Non-goals

- Running Spark, or anything JVM, in the browser.
- A general-purpose Spark UI replacement. (v2.0 adds *bring your own event log*, which is
  adjacent but deliberately narrow.)
- A backend of any kind. If a feature needs a server, it is out of scope or it is wrong.
- Mobile-perfect canvas animation. Mobile must be *legible*, not *identical*.

## Licence

Code MIT. Fixture data derives from public datasets under their own terms — see
[docs/DATA_PIPELINE.md](./docs/DATA_PIPELINE.md#6-licensing).
