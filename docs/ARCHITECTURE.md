# Architecture

## 1. Principles

1. **Static or it does not ship.** No backend, no runtime environment variables, no cold start.
   The whole app is a CDN artefact. If a feature requires a server, it is out of scope.
2. **The simulator is a library, not a component.** `packages/sim` has zero React and zero DOM
   imports. It is pure functions over plain data, unit-tested in isolation.
3. **One clock.** Every animated panel reads the same virtual timestamp from the store.
   Nothing animates on its own CSS transition timeline.
4. **Provenance is visible.** Any number on screen knows whether it came from a fixture, the
   model, or DuckDB, and says so.
5. **Determinism.** Same inputs produce byte-identical outputs. Seeded RNG only. This makes
   golden tests possible and makes permalinks trustworthy.

## 2. Package layout

A pnpm workspace monorepo. The boundaries matter more than the tooling.

```
packages/sim          # pure TS. No React, no DOM, no fetch.
  ├── model/          # cost model: partitions → tasks → stages
  ├── plan/           # logical/physical plan types + AQE rewrite rules
  ├── skew/           # Zipf/Pareto distributions, salting transform
  ├── calibration/    # constants fitted from fixtures (generated file + provenance)
  └── index.ts        # public API — the only thing apps/web may import

packages/viz          # chart primitives. React + D3 scales. No app state.
  ├── svg/            # PartitionHistogram, PlanTree, MemoryBar
  ├── canvas/         # TaskTimeline (Gantt), ShuffleField
  └── primitives/     # Axis, MetricRibbon, Badge, Scrubber

packages/fixtures     # committed JSON + a typed loader + schema validation
packages/ui           # design-system components (tokens, Slider, Tabs, CodePane)

apps/web              # Next.js App Router, output: 'export'
  ├── app/            # routes: /, /m/[moduleId], /challenge (v2)
  ├── modules/        # per-module composition: which viz, which knobs, which copy
  └── store/          # Zustand store + URL serialisation

tools/capture         # PySpark jobs → raw event logs → fixtures
tools/generator       # synthetic skew generator, TS + PySpark, identical semantics
```

**Dependency rule** (enforced in CI by `dependency-cruiser`):
`apps/web → packages/{ui,viz,sim,fixtures}`; `packages/viz → packages/ui`;
`packages/sim → nothing`. Any edge pointing the other way fails the build.

## 3. Data flow for one module

```
                         URL query string
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Zustand store        │  knobs + clock + playback
                    └───────────┬───────────┘
                                │ knobs
                                ▼
          ┌──────────────────────────────────────────┐
          │ fixture snap?   |knobs − fixture| < ε     │
          └───────┬──────────────────────┬───────────┘
              yes │                      │ no
                  ▼                      ▼
        packages/fixtures        packages/sim  simulate(knobs)
        loadFixture(id)                  │
                  │                      │
                  └──────────┬───────────┘
                             ▼
            RunResult { stages[], tasks[], metrics, provenance }
                             │
                             ▼
              packages/viz  ← reads RunResult + clock.t
                             │
                             ▼
                       rendered frame
```

`RunResult.provenance` is `'measured' | 'modeled'` and drives the badge. The snap tolerance ε
is per-knob and declared in each module spec.

## 4. The virtual clock

The store holds `{ t, playing, speed, duration }`. A single `requestAnimationFrame` loop in one
`<ClockDriver>` component advances `t`; components subscribe to `t` and derive their own frame.

Consequences:

- Scrubbing, pausing and stepping work everywhere for free.
- Before/after panes are trivially synchronised — they read the same `t`.
- `prefers-reduced-motion` is handled in one place: the driver does not advance, and the UI
  shows the final frame plus a step control.

Durations in `RunResult` are in **simulated milliseconds**. The clock maps them to render time
via `speed`; a six-minute stage plays in about 12 s at default speed. Never conflate the two —
the codebase uses `SimMs` and `RenderMs` as distinct branded type aliases.

## 5. Rendering budget

| Technique | Use for | Limit |
|---|---|---|
| SVG (React-rendered) | plan tree, partition histogram, memory bar, axes | ~2,000 live nodes |
| Canvas 2D | task-timeline Gantt (200–10,000 tasks), shuffle particle field | one `rAF` loop, quadtree hit-test for tooltips |
| WebGL | nothing currently | only past ~100k simultaneous marks |

D3 is used for `d3-scale`, `d3-shape`, `d3-array` and `d3-interpolate` only. **React owns the
DOM**; we never call `d3.select` on a node React rendered. This is a lint rule, not a
convention — `no-restricted-imports` blocks `d3-selection` inside `packages/viz/svg`.

Frame budget is 16 ms. The task timeline is the only thing at real risk; it is profiled in CI
via a Playwright trace on the M1 scenario — see
[CONTRIBUTING.md](./CONTRIBUTING.md#performance-gates).

## 6. Bundle policy

- First-load JS for `/` must stay under **160 kB gzipped**. CI fails the PR above that.
- DuckDB-WASM (~3 MB JS + ~35 MB wasm) is **never** in the initial graph. It loads behind an
  explicit user action (`await import('@duckdb/duckdb-wasm')`) and shows its own progress.
- Fixtures are fetched per module as static JSON, not bundled. Each must be ≤ 400 kB gzipped.
- Fonts: self-hosted subsets, `font-display: swap`, preloaded for the two faces used above the fold.

## 7. Routing and rendering mode

Next.js App Router with `output: 'export'`. Every module is a statically generated route at
`/m/[moduleId]` via `generateStaticParams`. No middleware, no route handlers, no ISR — those all
imply a server. All interactivity sits in client components below a static shell, so the first
paint is real content, not a spinner.

## 8. Accessibility

- Every knob is a real `<input type="range">` with a label, keyboard-operable, with a visible
  focus ring and a live-region announcement of the resulting headline metric.
- Nothing is encoded by colour alone. The straggler bar also carries a marker and a text label.
- Charts expose a `<title>`/`<desc>` pair and, where the data is tabular, a visually hidden table.
- `prefers-reduced-motion: reduce` means no autoplay and step controls only.

## 9. What lives where — quick answers

| Question | Answer |
|---|---|
| Where do I add a new Spark config knob? | `packages/sim/model/config.ts` (defaults + bounds), then the module spec |
| Where does the AQE rewrite happen? | `packages/sim/plan/aqe.ts`, as pure plan→plan functions |
| Where do I put a new chart? | `packages/viz`, with no knowledge of the store |
| Where does copy live? | Co-located with the module in `apps/web/modules/<id>/copy.ts` |
| How do I add a fixture? | `tools/capture`, then `packages/fixtures` — see FIXTURES.md |
