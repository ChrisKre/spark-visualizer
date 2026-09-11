# ADR-0005 — SVG below ~2,000 marks, Canvas above, no WebGL

- **Status:** accepted
- **Date:** 2026-09-11

## Context

The visualisations range from a 12-node plan tree to a 10,000-task Gantt chart. One rendering
technique will not serve both well, and mixing them arbitrarily produces a codebase where nobody
knows which to reach for.

## Decision

| Technique | Use for | Boundary |
|---|---|---|
| SVG, rendered by React | plan tree, partition histogram, memory bar, axes, legends | up to ~2,000 live nodes |
| Canvas 2D, one `rAF` loop | task-timeline Gantt, shuffle particle field | above that |
| WebGL | nothing | revisit past ~100,000 simultaneous marks |

**React owns the DOM.** `d3-selection` is banned by lint inside `packages/viz/svg`; D3 is used
for `d3-scale`, `d3-shape`, `d3-array` and `d3-interpolate` only.

## Rationale

- SVG elements are inspectable, stylable by theme tokens, and accessible for free. A portfolio
  piece will have devtools opened on it; readable SVG is a feature.
- Past a couple of thousand nodes, React reconciliation plus layout blows the 16 ms budget.
- Two people mutating the same DOM — React and `d3.select` — is the classic source of
  disappearing-element bugs in D3-in-React codebases. The lint rule removes the category.
- WebGL buys nothing at the scales in the module list and costs a shader toolchain, a fallback
  path, and a class of GPU-specific bugs.

## Consequences

- Canvas components must supply an accessible equivalent. The task timeline ships with a
  keyboard-navigable task list carrying the same data.
- Canvas hit-testing uses a quadtree built once per `RunResult`, not a per-frame linear scan.
- The Canvas components are the only code permitted to call `requestAnimationFrame` besides the
  clock driver, and they draw inside the frame the driver gives them.
- A Playwright performance trace on the M1 scenario is a CI gate: p95 frame ≤ 16 ms over 10 s of
  playback.
