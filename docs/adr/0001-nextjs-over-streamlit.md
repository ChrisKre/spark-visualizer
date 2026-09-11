# ADR-0001 — Next.js static export, not Streamlit

- **Status:** accepted
- **Date:** 2026-09-11
- **Deciders:** project owner

## Context

The project is a portfolio artefact aimed at recruiters (30 seconds), lead architects (5 minutes)
and Databricks engineering managers (deep read). It needs bespoke, high-frame-rate interaction:
a virtual clock driving synchronised before/after panes, a plan tree that rewrites itself, and a
Canvas Gantt of up to 10,000 tasks.

Options considered: Streamlit, Gradio, Observable Framework, Next.js + TypeScript + D3,
Three.js-led.

## Decision

Next.js (App Router) with `output: 'export'`, TypeScript, D3 for scales and shape generators
only, deployed as static files.

## Rationale

1. **Hosting.** Streamlit and Gradio need a live Python process. Free tiers sleep. A recruiter
   who hits a 40-second cold start closes the tab, and that is the primary audience.
2. **Interaction ceiling.** Streamlit reruns the script on interaction. That model fights a
   60 fps `requestAnimationFrame` clock, and any custom visualisation ends up as an iframe
   component with its own JS build — so the frontend work happens anyway, just with a worse
   integration story.
3. **Signal.** The stack is itself read as evidence. "Architect who also ships production
   frontends" is the intended inference; "data scientist who prototypes" is not.
4. **Cost.** Static CDN hosting is free and never sleeps.

## Consequences

- Slower start: 2–3 weeks to first demo instead of a weekend. Accepted.
- Python is confined to `tools/` (fixture capture, calibration, data prep) and never runs at
  request time.
- We take on frontend concerns — bundle budgets, accessibility, theming — that a Streamlit app
  would have hidden. These are tracked as CI gates rather than left to judgement.

## Alternatives

**Observable Framework** is the honest fallback. It keeps static hosting and the D3 ceiling, and
costs only the bespoke interaction design (scrubber, synchronised panes, challenge mode). If
React proves to be the wrong place to spend three weeks, reopen this ADR rather than retrofitting
Streamlit.

**Three.js** was rejected outright: partition sizes and task durations are one-dimensional
quantities read against a shared baseline, and perspective destroys exactly the comparison the
project exists to make.
