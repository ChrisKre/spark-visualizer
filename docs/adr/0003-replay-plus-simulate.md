# ADR-0003 — Replay for truth, simulate for interactivity, label both

- **Status:** accepted
- **Date:** 2026-09-11

## Context

Two incompatible requirements:

1. The numbers must be real, or the project is a cartoon and an experienced reviewer will treat
   it as one.
2. The sliders must respond instantly to arbitrary parameter values, which no finite set of
   recorded runs can cover.

Replay alone satisfies (1) and fails (2). Simulation alone satisfies (2) and fails (1).

## Decision

Do both, keep them **visibly separate**, and publish the calibration.

- Capture 5–8 real runs per module across the parameter range. Commit them as fixtures.
- Fit the simulator's constants to those runs by least squares.
- At runtime, snap to a fixture when the knobs are within ε of one; otherwise simulate.
- Every metric panel carries a `MEASURED` or `MODELED` badge driven solely by
  `RunResult.provenance`.
- Publish a model-vs-measured residual chart in the UI and the README.

## Rationale

Real task timings have a texture — deserialisation jitter, a GC pause landing on an unlucky task,
a straggler that is *not* the biggest partition — that no cost model reproduces. A reviewer who
has stared at real Spark timelines feels the difference immediately, even without being able to
name it. So replay is not a nice-to-have; it is the credibility mechanism.

Admitting where the model takes over reads as rigour, not weakness. It converts "your simulator
is wrong" from a refutation into a conversation with a published error bar.

## Consequences

- A fixture-capture workflow is required before the UI can be finished for any module. This
  sequences the backlog: capture precedes module completion.
- `MEASURED` must never be shown for a modelled result. This is enforced by construction — the
  badge reads `provenance`, and `provenance` is set by the resolver, not by a component.
- A CI gate holds stage wall-clock MAE at or below 12 %. A model change that moves it must be
  declared in the PR.
- Where the model is weak (JVM GC time, currently ~19 % MAE) the UI says so rather than hiding it.
