# Roadmap

**Ship one module publicly before building the second.** An unshipped six-module platform is
worth nothing on a CV; one shipped module with a 60-second recording is worth a phone screen.

## v1.0 — MVP

*Target: ~45–60 h, 3–4 weekends. Goal: one link that proves the thesis in thirty seconds.*

- **M1 Skew & salting**, complete: histogram, task Gantt, α / salt / null sliders,
  before-after scrubber, metric ribbon.
- **M2 AQE**, coalescing and skew join only — the dynamic join switch is deferred.
- The TypeScript simulator plus **one calibrated fixture pair per module**, captured on a real
  cluster, committed to the repo.
- NYC taxi slim dataset plus the synthetic generator in both TS and PySpark.
- Deep-linkable URL state and the `MEASURED` / `MODELED` badge.
- Code pane per module: the diff, the config, the `EXPLAIN FORMATTED` output.
- README with the architecture diagram and the calibration chart — **the repo is half the
  portfolio**.
- A 60-second screen recording. This, not the site, is what actually travels on LinkedIn.

**Explicitly out:** DuckDB-WASM, challenge mode, mobile-perfect canvas, any backend, any auth.

## v1.1 — make the compute real

*Target: +2 weekends.*

- DuckDB-WASM query pane with the live bytes-transferred counter over range-read Parquet.
- **M3 Join strategies** — three lanes, one clock, bytes-on-wire per lane.
- AQE dynamic join-strategy switching, completing M2.
- **M0 primer** on lazy evaluation and stage boundaries.

## v2.0 — from demo to tool

*Target: +4–6 weekends.*

- **M4 Memory & spill** with the four-regime slider.
- **M6 Delta file skipping** with the bytes-scanned counter.
- **Challenge mode** with scoring and shareable results. Present a broken job the way an engineer
  meets one — a timeline, a spill counter, a plan, no explanation — give four knobs, a config
  budget and an SLA, and score the attempt.
- **Bring your own event log** — drag a real Spark event log onto the page and it renders your
  stages, your stragglers, your spill. Parsed in a Web Worker, entirely client-side, and the UI
  says so. This is the feature that converts the project from a teaching toy into something an
  engineer bookmarks.
- Generated OG images per scenario, so a shared permalink previews the actual broken timeline.

## v3.0 — if it earns it

- **M5 Shuffle mechanics** canvas particle field.
- Cost model in DBUs and dollars — the number that actually moves a Databricks conversation.
- Embeddable single-module widgets for other people's posts, which is how this gets traffic you
  did not generate.

## Sequencing rules

1. **Capture before build.** A module cannot be finished before its fixtures exist, so schedule
   the cluster session ahead of the UI work.
2. **Publish between modules.** One post per module, each linking to a live permalink of the
   broken configuration. The build is the smaller half.
3. **Measure, then choose.** Analytics decide whether M3 or M4 comes first in practice. The order
   above is the default, not a commitment.

## Risks

| Risk | Mitigation |
|---|---|
| Scope creep into a platform | Six half-built modules read worse than one finished. The roadmap is ordered, not a menu. |
| Simulator fidelity arguments | The `MODELED` badge and the published calibration residual make it a conversation, not a refutation. |
| Bundle weight | DuckDB stays behind a lazy import triggered by a user action. CI gate on first-load JS. |
| Mobile | Recruiters open links on phones. Histogram and ribbon must work at 400 px even if the canvas degrades to a static frame. |
| Silence | The build is the smaller half. One post per module, with a permalink, or none of this is visible. |
| Cluster access for fixtures | Databricks free edition or a single local Docker Spark is sufficient. Do not block the UI work waiting for ideal infrastructure — modelled-only is an acceptable interim state as long as the badge is honest. |

## The CV line this is aiming at

> Built an interactive Spark-internals visualiser: a deterministic TypeScript execution simulator
> calibrated to within ±8 % of measured stage durations across 34 instrumented Spark runs,
> rendering skew, AQE plan rewrites and spill behaviour from real event-log fixtures. Static,
> zero-infrastructure, client-side Parquet execution via DuckDB-WASM.

Every clause in that sentence is something v1.0 plus v1.1 actually delivers. That is why the
scope is drawn where it is.
