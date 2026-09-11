# Backlog

Everything needed to get **Shuffle & Spill** from an empty repo to a published v1.0, plus the
shape of v1.1 and v2.0.

Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and
[docs/SIMULATOR_SPEC.md](./docs/SIMULATOR_SPEC.md) before picking up anything in E2, E5, E6 or E7.

---

## How to use this

**Ticket id:** `SAS-nnn`. Branch name `SAS-nnn-short-slug`. Never reuse an id.

**Estimates** are in hours of focused work by one person who has read the docs. They assume the
architecture decisions are accepted, not re-litigated.

**Labels**

| Label | Meaning |
|---|---|
| `good-first` | self-contained, low context needed — start here |
| `critical-path` | v1.0 cannot ship without it, and something else is waiting on it |
| `needs-cluster` | requires a Spark cluster session; batch these together |
| `spike` | timeboxed investigation, output is a decision not code |
| `cut-candidate` | drop this first if the MVP is running late |

**⚡** marks the *minimum shippable cut*: the 46 h subset that still produces a publishable v1.0.
Everything else in v1.0 is desirable but droppable under time pressure.

**Definition of done** is in [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md#definition-of-done)
and applies to every ticket. Ticket-level criteria below are *additional*.

---

## Milestones

| Milestone | Scope | Estimate | Exit criterion |
|---|---|---|---|
| **v1.0 MVP** | E1–E9 | **~72 h** (⚡ cut: ~46 h) | Public URL, M1 complete, M2 partial, calibration published, 60-second recording posted |
| v1.1 | E10 | ~34 h | DuckDB query pane live, M3 shipped, M2 complete, M0 primer |
| v2.0 | E11 | ~60 h | M4 + M6, challenge mode, bring-your-own-event-log |

---

## Epic overview

| Epic | Name | Tickets | Est | Milestone |
|---|---|---|---|---|
| **E1** | Foundation & tooling | SAS-001…008 | 13 h | v1.0 |
| **E2** | Simulator core | SAS-010…019 | 20 h | v1.0 |
| **E3** | Fixture & calibration pipeline | SAS-020…026 | 13 h | v1.0 |
| **E4** | Data pipeline | SAS-030…034 | 8 h | v1.0 |
| **E5** | Visualisation primitives | SAS-040…047 | 18 h | v1.0 |
| **E6** | Module M1 — skew | SAS-050…056 | 12 h | v1.0 |
| **E7** | Module M2 — AQE | SAS-060…065 | 12 h | v1.0 |
| **E8** | App shell & state | SAS-070…077 | 14 h | v1.0 |
| **E9** | Content & launch | SAS-080…086 | 10 h | v1.0 |
| E10 | v1.1 | SAS-090…097 | 34 h | v1.1 |
| E11 | v2.0 | SAS-100…108 | 60 h | v2.0 |

*(Epic totals exceed the 72 h milestone figure because E2/E3/E5 partially overlap with module
work; the milestone figure is the critical-path estimate, not the sum.)*

---

## E1 — Foundation & tooling

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-001 ⚡ | Initialise pnpm monorepo + Next.js static export | 2 h | — | `critical-path` |
| SAS-002 ⚡ | TypeScript strict config + branded unit types | 1 h | 001 | `good-first` |
| SAS-003 ⚡ | Design tokens + three-state theming | 2 h | 001 | `critical-path` |
| SAS-004 ⚡ | Deploy pipeline: Vercel, preview per PR | 1 h | 001 | `critical-path` |
| SAS-005 | CI: typecheck, lint, vitest | 2 h | 001 | — |
| SAS-006 | `dependency-cruiser` package boundary rules | 1 h | 005 | — |
| SAS-007 | Bundle budget gate (160 kB gz) | 1 h | 005 | `cut-candidate` |
| SAS-008 | Playwright: a11y + visual regression + perf trace | 3 h | 005 | `cut-candidate` |

**SAS-001** — pnpm workspaces, `apps/web` + `packages/{sim,viz,ui,fixtures}` + `tools/`,
Next.js 15 App Router with `output: 'export'`, Node 20 `.nvmrc`.
*Done when:* `pnpm dev` serves a page, `pnpm build` emits `apps/web/out`, the workspace graph
matches [ARCHITECTURE §2](./docs/ARCHITECTURE.md#2-package-layout).

**SAS-002** — `strict`, `noUncheckedIndexedAccess`, and the branded aliases `SimMs`, `RenderMs`,
`Bytes`, `MiB` in `packages/sim/types.ts`.
*Done when:* assigning a `Bytes` to a `MiB` is a compile error, with a test asserting it via
`tsd` or an `@ts-expect-error` fixture.

**SAS-003** — token set from [DESIGN_SYSTEM §1](./docs/DESIGN_SYSTEM.md#1-tokens).
*Done when:* all three theme states render correctly (explicit light, explicit dark, **unstamped
system**); every token is defined in the bare `:root` before any override block; a raw hex outside
`tokens.css` fails lint.

**SAS-004** — *Done when:* `main` auto-deploys, every PR gets a preview URL, and the production
URL is in the README.

**SAS-008** — three Playwright suites: `axe` scan per route, screenshot diff in light and dark,
and a trace asserting p95 frame ≤ 16 ms over 10 s of M1 playback.
*Done when:* all three run in CI and fail the build on regression.

---

## E2 — Simulator core

The product. Read [SIMULATOR_SPEC.md](./docs/SIMULATOR_SPEC.md) first; it is normative.

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-010 ⚡ | `RunConfig` / `RunResult` types + public API | 1 h | 002 | `critical-path` |
| SAS-011 ⚡ | Seeded PRNG + Zipf inverse transform | 2 h | 010 | `good-first` |
| SAS-012 ⚡ | Partition sizing: hashing, nulls, salting | 3 h | 011 | `critical-path` |
| SAS-013 ⚡ | Plan model + join strategy selection | 2 h | 010 | `critical-path` |
| SAS-014 ⚡ | Task generation & cost model | 3 h | 012, 013 | `critical-path` |
| SAS-015 ⚡ | Slot scheduler (discrete event) | 2 h | 014 | `critical-path` |
| SAS-016 ⚡ | Metric rollup + warnings | 1 h | 015 | — |
| SAS-017 | AQE rewrite rules (all three) | 4 h | 013, 015 | `critical-path` |
| SAS-018 | Spill & GC model | 3 h | 014 | — |
| SAS-019 ⚡ | Golden, invariant & monotonicity tests | 3 h | 016 | `critical-path` |

**SAS-011** — `mulberry32` plus inverse-transform sampling for Zipf(α) over N keys.
*Done when:* α=0 gives a uniform histogram; α=1.6 gives a top key holding 45–55 % of rows; same
seed gives identical output across 100 runs.

**SAS-012** — murmur32 hash → `nonNegativeMod(hash, shufflePartitions)`. Nulls assigned **first**
to a single synthetic key. Salting appends `_<rowIndex % saltFactor>` before hashing.
*Done when:* total bytes is conserved under salting (invariant test); `nullFraction = 0.03` with
`α = 0` still produces a straggler ratio > 10.

**SAS-014** — the additive cost model from [SIMULATOR_SPEC §2.4](./docs/SIMULATOR_SPEC.md).
Constants imported from `calibration/constants.generated.ts`; a hand-written placeholder file is
acceptable until SAS-025 lands, but must carry a `PLACEHOLDER` header.
*Done when:* costs are additive per the spec; no constant is inlined at a call site.

**SAS-015** — `slots = executors × cores`, FIFO within a stage, per-reducer `fetchWaitMs` sharing
`networkBandwidthMBps` across active slots.
*Done when:* stage wall clock is computed as `max(finish) − min(launch)` and a test asserts it is
**not** the sum of task times.

**SAS-017** — three pure `(plan, runtimeStats) => plan` functions, fixed order: skew split →
coalesce → join selection. Each emits an `AqeRewrite` record with rule name, clock position and a
human-readable change description.
*Done when:* each rule fires on its documented trigger and only then; rewrites carry the clock
position of the producing stage's completion; disabling AQE produces zero rewrites.

**SAS-018** — execution/storage borrow-and-evict asymmetry, spill penalty, quadratic GC, OOM
threshold.
*Done when:* execution can evict storage to the floor and storage can never evict execution
(explicit test); a low-memory config produces a genuine `oom` status rather than a clamped number.

**SAS-019** — *Done when:* 12 canonical configs have committed output hashes; invariants and
monotonicity properties from [SIMULATOR_SPEC §5](./docs/SIMULATOR_SPEC.md#5-testing-requirements)
all assert; simulator line coverage ≥ 90 %.

---

## E3 — Fixture & calibration pipeline

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-020 | Cluster access + capture environment | 1 h | — | `needs-cluster`, `spike` |
| SAS-021 ⚡ | Capture scripts: configure, run, reduce | 3 h | 020, 030 | `needs-cluster`, `critical-path` |
| SAS-022 ⚡ | Fixture JSON schema + Zod validation + loader | 2 h | 010 | `critical-path` |
| SAS-023 ⚡ | Capture session: M1 grid (8 runs) | 2 h | 021 | `needs-cluster`, `critical-path` |
| SAS-024 | Capture session: M2 grid (7 runs) | 2 h | 021 | `needs-cluster` |
| SAS-025 ⚡ | `calibrate.py` → `constants.generated.ts` + residual report | 3 h | 023 | `critical-path` |
| SAS-026 | CI gate: calibration MAE ≤ 12 % | 1 h | 025, 005 | — |

**SAS-020** — timeboxed. Decide between Databricks free edition, a local Docker Spark 3.5, and a
single spot node. Output: a one-page note in `tools/capture/README.md` naming the choice, the cost
and the exact environment block that will go into every fixture header.

**SAS-021** — the three scripts from [FIXTURES.md](./docs/FIXTURES.md): `00_configure.py`,
the scenario runner, `10_reduce.py`.
*Done when:* one end-to-end run produces a validated fixture ≤ 400 kB gzipped with a complete
environment block; task-level jitter is preserved (no smoothing).

**SAS-023** — the eight-run grid in
[FIXTURES §5](./docs/FIXTURES.md#5-coverage-requirement), including `m1_a16_null3`.
*Done when:* all eight validate and are committed, with `pairedWith` set on the hero pair.

**SAS-025** — least-squares fit; emits the constants file with a provenance header and prints the
residual report.
*Done when:* stage wall-clock MAE ≤ 12 %; the report is committed as
`docs/calibration-report.md`; the constants file is never hand-edited (lint or CODEOWNERS).

> **Sequencing note:** SAS-020/021/023/024 are the only `needs-cluster` tickets. Batch them into
> one session. Until they land, the simulator runs on `PLACEHOLDER` constants and every panel
> shows `MODELED` — which is a valid, honest interim state and must not block E5–E8.

---

## E4 — Data pipeline

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-030 ⚡ | Synthetic generator, PySpark | 2 h | — | `good-first` |
| SAS-031 ⚡ | Synthetic generator, TypeScript | 2 h | 011 | `good-first` |
| SAS-032 ⚡ | Generator parity test (TS vs PySpark) | 1 h | 030, 031 | `critical-path` |
| SAS-033 | NYC TLC slim Parquet build script | 2 h | — | `good-first` |
| SAS-034 | Dataset attribution page `/about` | 1 h | 033 | `good-first` |

**SAS-032** — *Done when:* both implementations, same seed and parameters, produce key-frequency
histograms agreeing within 0.5 % per bucket, asserted in CI. This test is what makes the fixtures
and the sliders describe the same world — do not skip it.

**SAS-033** — outputs `trips_hourly.parquet`, `trips_sample.parquet`, `zones.parquet`.
*Done when:* total `public/data` ≤ 40 MB; the sample preserves the `PULocationID` distribution
(KS test in the script); raw source data is **not** committed.

---

## E5 — Visualisation primitives

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-040 ⚡ | Chart scaffolding: scales, axes, responsive viewBox | 2 h | 003 | `good-first` |
| SAS-041 ⚡ | `PartitionHistogram` (SVG) | 3 h | 040 | `critical-path` |
| SAS-042 ⚡ | `TaskTimeline` Gantt (Canvas) | 5 h | 040 | `critical-path` |
| SAS-043 ⚡ | `MetricRibbon` with compare columns | 3 h | 040 | `critical-path` |
| SAS-044 ⚡ | `Badge` (MEASURED / MODELED / EXECUTED) | 1 h | 003 | `good-first` |
| SAS-045 | `PlanTree` (SVG) with rewrite animation | 4 h | 040 | `critical-path` |
| SAS-046 | `MemoryBar` (SVG) | 2 h | 040 | `cut-candidate` |
| SAS-047 | Number formatter module | 1 h | 002 | `good-first` |

**SAS-041** — 200 bars, descending, shared scale across panes, annotation + leader line on the
tallest bar.
*Done when:* before/after panes share one y-scale; the tall bar carries a text label as well as
colour; readable at 400 px; `<title>`/`<desc>` present plus a visually hidden data table.

**SAS-042** — Canvas, one `rAF` loop from the clock driver, quadtree hit-test for tooltips.
*Done when:* 60 fps at 200 tasks and at 2,000 tasks; tooltip shows task id, partition id,
duration, shuffle read, spill; a **keyboard-navigable task list** provides the accessible
equivalent; degrades to a final static frame under `prefers-reduced-motion`.

**SAS-043** — `wall clock · CPU-s · straggler ratio · shuffle read · disk spilled · GC %`, in that
order, sticky.
*Done when:* compare mode shows before / after / signed delta; delta colour reflects whether lower
is better per metric; **CPU-s is never hidden at narrow widths** (it carries the core lesson);
tabular numerals throughout.

**SAS-045** — *Done when:* a rewrite animates outgoing nodes out and incoming nodes in at the
correct clock position, with a labelled annotation naming the rule and the concrete change; the
tree scrolls in its own container rather than widening the page.

**SAS-047** — MiB/GiB for memory and partitions, MB/s for throughput, the duration ladder from
[DESIGN_SYSTEM §3](./docs/DESIGN_SYSTEM.md#3-units--this-is-where-credibility-is-won-or-lost).
*Done when:* no component formats a number inline; a lint rule or review checklist enforces it.

---

## E6 — Module M1: skew

Spec: [docs/modules/m1-skew.md](./docs/modules/m1-skew.md).

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-050 ⚡ | Module scaffold + route `/m/skew` | 1 h | 070 | `good-first` |
| SAS-051 ⚡ | Knob set (α, salt, nulls, executors) + bounds | 2 h | 050, 072 | `critical-path` |
| SAS-052 ⚡ | Wire histogram + timeline + ribbon to the run | 2 h | 041, 042, 043 | `critical-path` |
| SAS-053 ⚡ | Before/after compare mode | 2 h | 052 | `critical-path` |
| SAS-054 ⚡ | Fixture snapping + badge flipping | 2 h | 022, 023 | `critical-path` |
| SAS-055 ⚡ | Null-trap preset + copy | 1 h | 051 | — |
| SAS-056 ⚡ | Code pane: diff / config / EXPLAIN | 2 h | 023 | — |

**SAS-054** — *Done when:* the badge reads `MEASURED` only when a fixture was genuinely used;
snapping uses the per-knob ε from the module spec; a modelled result can never display `MEASURED`
by construction, not by convention.

**SAS-055** — reachable in one click, labelled "Try: 3 % null keys".
*Done when:* with `α = 0` and `nulls = 0.03` the straggler is severe, salting visibly does **not**
fix it, and the copy says the fix is a filter.

**SAS-056** — *Done when:* EXPLAIN content is verbatim captured output, byte-for-byte; all three
tabs copyable; highlighted at build time, not with a runtime highlighter library.

---

## E7 — Module M2: AQE

Spec: [docs/modules/m2-aqe.md](./docs/modules/m2-aqe.md).

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-060 | Module scaffold + route `/m/aqe` | 1 h | 070 | `good-first` |
| SAS-061 | Knob set (aqe, advisory, skew factor, estimate error) | 2 h | 060, 072 | — |
| SAS-062 | Plan tree wired to rewrite events | 3 h | 045, 017 | `critical-path` |
| SAS-063 | Partition strip (200 → 17 coalescing) | 2 h | 040 | — |
| SAS-064 | AQE off/on comparison on one clock | 2 h | 062, 053 | `critical-path` |
| SAS-065 | Code pane + captured `AdaptiveSparkPlan` EXPLAIN | 2 h | 024 | — |

**SAS-062** — *Done when:* each rewrite fires at the clock position of its producing stage's
completion, not at t=0; every rewrite is annotated with rule name and concrete change; AQE off
produces a frozen plan.

**SAS-064** — *Done when:* the same query renders twice on one clock, left plan frozen and right
plan rewriting itself; the ribbon shows the task-count delta from coalescing.

> v1.0 ships coalescing + skew join. The dynamic join switch (SAS-092) is v1.1 and must be shown
> as unavailable rather than faked.

---

## E8 — App shell & state

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-070 ⚡ | App shell, module layout, nav | 2 h | 003 | `critical-path` |
| SAS-071 ⚡ | Zustand store + selector discipline | 2 h | 010 | `critical-path` |
| SAS-072 ⚡ | Virtual clock + `ClockDriver` | 3 h | 071 | `critical-path` |
| SAS-073 ⚡ | Scrubber: play / pause / step / speed | 2 h | 072 | `critical-path` |
| SAS-074 ⚡ | URL serialisation of knobs + compare + t | 2 h | 071 | `critical-path` |
| SAS-075 | Landing page | 2 h | 070 | — |
| SAS-076 | Error & edge states (OOM, fixture fail, clamping) | 2 h | 071 | — |
| SAS-077 | Cookieless analytics | 1 h | 070 | `cut-candidate` |

**SAS-072** — one `rAF` loop, `t` in simulated ms, no looping playback, reduced-motion handled
here and nowhere else.
*Done when:* no component outside `ClockDriver` and `packages/viz/canvas` calls
`requestAnimationFrame`; both panes in compare mode read the same `t`.

**SAS-074** — short keys, defaults omitted, `history.replaceState` on a 250 ms trailing debounce,
`t` stored as a fraction of duration.
*Done when:* a permalink round-trips every knob plus compare and clock position; unknown keys warn
and are dropped rather than erroring; dragging a slider does not flood the history stack.

**SAS-076** — *Done when:* a simulated OOM renders as a **failed stage**, not a large number; a
fixture fetch failure falls back to the model and flips the badge with a quiet notice; nonsensical
knob combinations clamp with an explanation rather than silently correcting.

---

## E9 — Content & launch

| ID | Title | Est | Deps | Labels |
|---|---|---|---|---|
| SAS-080 ⚡ | M1 prose: setup, takeaway, annotations | 2 h | 052 | `critical-path` |
| SAS-081 | M2 prose | 1 h | 062 | — |
| SAS-082 ⚡ | README: architecture diagram + calibration chart | 2 h | 025 | `critical-path` |
| SAS-083 | `/about`: three-layer model, honesty statement, attribution | 1 h | 034 | — |
| SAS-084 | Spark UI side-by-side screenshots | 1 h | 023 | `needs-cluster` |
| SAS-085 ⚡ | 60-second screen recording | 2 h | 053 | `critical-path` |
| SAS-086 | Launch posts, one per module, with permalinks | 1 h | 085 | — |

**SAS-082** — *Done when:* the README carries the three-layer diagram and the residual chart with
the MAE quoted. This is the most senior-looking artefact in the repository; an architect will look
for exactly this before trusting the simulator.

**SAS-084** — a screenshot of the same stage in the real Spark UI, placed beside our rendering.
Side-by-side proof beats an iframe that would need a server.

**SAS-085** — *Done when:* under 70 seconds, no narration required to follow, shows the skew
slider moving with CPU-s flat and wall clock climbing, ends on the salted fix. This travels
further than the site itself.

---

## E10 — v1.1

| ID | Title | Est | Deps |
|---|---|---|---|
| SAS-090 | DuckDB-WASM lazy loader + worker setup | 5 h | 001 |
| SAS-091 | Query pane + bytes-transferred counter over range-read Parquet | 6 h | 090 |
| SAS-092 | AQE dynamic join-strategy switch (completes M2) | 4 h | 017 |
| SAS-093 | M3 join strategies — three lanes, one clock | 8 h | 042, 043 |
| SAS-094 | M3 crossover chart | 3 h | 093 |
| SAS-095 | M0 primer — drag-to-build DAG | 5 h | 045 |
| SAS-096 | Fat Parquet bucket: CORS, range requests, cache headers | 2 h | — |
| SAS-097 | Capture session: M3 grid | 2 h | 021 |

## E11 — v2.0

| ID | Title | Est | Deps |
|---|---|---|---|
| SAS-100 | M4 memory & spill module | 10 h | 018, 046 |
| SAS-101 | Capture session: memory sweep (expect two calibration rounds) | 4 h | 021 |
| SAS-102 | M6 Delta file skipping module | 8 h | 091 |
| SAS-103 | Capture session: OPTIMIZE / ZORDER + DESCRIBE HISTORY | 3 h | 021 |
| SAS-104 | Challenge mode: scenario, budget, SLA, scoring | 10 h | 074 |
| SAS-105 | Bring your own event log — worker parser | 10 h | 022 |
| SAS-106 | Generated OG images per scenario | 4 h | 074 |
| SAS-107 | Move simulation to a Web Worker if it exceeds the frame budget | 5 h | 014 |
| SAS-108 | Task locality modelling in the scheduler | 6 h | 015 |

---

## Execution order

### Critical path to v1.0

```
001 → 003 → 070 → 071 → 072 ─┬→ 073 ─┐
                             └→ 074  │
010 → 011 → 012 → 014 → 015 → 016 ───┼→ 052 → 053 → 080 → 085
                    040 → 041,042,043┘
020 → 021 → 023 → 025 → 054 ─────────┘
```

The two chains that can stall everything: **the cluster session (SAS-020/021/023)** and
**the clock (SAS-072)**. Start both early.

### Parallel tracks for three people

| Track | Owner profile | Tickets |
|---|---|---|
| **A — Simulator** | strongest Spark knowledge | E2 entirely, then SAS-017/018 |
| **B — Visualisation** | strongest frontend | E1, E5, then E8 |
| **C — Data & fixtures** | comfortable with PySpark | E3, E4, then E9 content |

Tracks A and B converge at SAS-052. Track C gates SAS-054 and SAS-082, so C must not start last.

### If you are working alone

Do it in this order, publishing after step 5:

1. SAS-001, 002, 003, 004 — a deployed empty shell on day one.
2. SAS-010…016, 019 — a working simulator with placeholder constants, tested.
3. SAS-040…044, 047 — charts fed by the simulator.
4. SAS-070…074 — shell, clock, permalinks.
5. SAS-050…056 — **M1 complete. Publish. Record the clip. Post it.**
6. SAS-020…026 — the cluster session; fixtures replace placeholders, badges start flipping.
7. SAS-017, E7 — M2.
8. E9 — README, calibration chart, launch posts.

Steps 1–5 are the ⚡ cut and honestly answer "what did you build?" on their own.

---

## Parking lot

Ideas deliberately not scheduled. Do not start these; move one into an epic first.

- Photon / vectorised-execution comparison
- DBU and dollar cost model (v3)
- Embeddable single-module widgets (v3)
- Pyodide code pane with editable Python that does not execute
- Speculative execution, dynamic allocation, task retries
- Structured Streaming micro-batch visualisation
- A global leaderboard for challenge mode — **blocked by [ADR-0006](./docs/adr/0006-no-backend.md)**
