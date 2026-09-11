# Design system

The aesthetic is **instrument, not dashboard**. A visualiser about latency that drops frames or
mislabels an axis undermines its own argument, so precision is the design language.

## 1. Tokens

Defined once in `packages/ui/tokens.css` as CSS custom properties on `:root`. Three theme states
must be handled: explicit light, explicit dark, and unstamped system default.

```css
:root { /* complete light palette — every token defined here */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* redefine tokens only */ }
}
:root[data-theme="dark"] { /* redefine tokens again so the toggle wins */ }
```

**A token whose only definition sits inside a media or `[data-theme]` block is a bug.** It will
render one theme's text on the other theme's ground.

| Group | Tokens |
|---|---|
| Ground | `--ground`, `--surface`, `--surface-2` |
| Text | `--ink`, `--body`, `--muted` |
| Rules | `--rule`, `--rule-soft` |
| Accent | `--accent` (ember), `--accent-soft` |
| Semantic | `--ok` (teal), `--warn` (amber), `--crit` (red), each with a `-soft` pair |

**Semantic colour is not accent colour.** Spill, straggler and OOM own fixed hues that never
appear decoratively. If a colour means something in a chart, it may not also be used for a button.

## 2. Type

| Role | Face | Use |
|---|---|---|
| Display / headings | a grotesque with real character (not Inter, not Space Grotesk) | section heads, module titles, big metric values |
| Body | a text serif | prose, explanations, code-pane commentary |
| Data / utility | a monospace | **every metric, every config key, every label with a number in it** |

Rules:

- Running text near 65 characters. Headings get `text-wrap: balance`.
- Uppercase labels carry letter-spacing; body text never does.
- One type scale, declared as tokens. No ad-hoc `font-size` in a component.
- `font-variant-numeric: tabular-nums` on every digit that animates or sits in a column.
  Jittering digits during playback is the single most common polish failure here.

## 3. Units — this is where credibility is won or lost

- Binary prefixes for memory and partition sizes: **`MiB`, `GiB`**. Decimal for network and
  disk throughput: `MB/s`. Spark's own UI is inconsistent about this; we are not.
- Durations: `< 1 s` in ms, `< 90 s` as `48.2 s`, beyond that `6m 21s`.
- Byte counts always carry a unit and never more than three significant figures.
- One formatter module, `packages/ui/format.ts`. Nothing formats a number inline.

## 4. Chart rules

1. One scale per comparison. Before/after panes **share** an axis, always. A comparison drawn on
   two different scales is a lie, and it is the exact lie this project exists to refute.
2. Every axis is labelled and every label names a value the chart actually reaches.
3. Chart text takes its colour from theme tokens. No hard-coded `#333`.
4. Every SVG shape gets an explicit `fill`. Leave room in the `viewBox` for outermost labels.
5. Nothing is encoded by colour alone — the straggler bar carries a marker and a text label too.
6. Marks, labels and edges stay clear of each other and inside the drawing bounds.
7. Charts wider than the column get their own `overflow-x: auto` container. The page body never
   scrolls sideways.

## 5. Components

| Component | Notes |
|---|---|
| `MetricRibbon` | persistent, sticky. Wall clock, CPU-s, shuffle R/W, spill, GC. In compare mode: before / after / delta. |
| `Badge` | `MEASURED` / `MODELED` / `EXECUTED`. Driven only by `RunResult.provenance`. |
| `Knob` | labelled `<input type="range">`, value shown in monospace, config key shown verbatim (`spark.sql.shuffle.partitions`) |
| `Scrubber` | play/pause/step/speed + the timeline position |
| `CodePane` | tabbed: **Diff** / **Config** / **EXPLAIN**. Static, copyable, syntax-highlighted at build time. |
| `PlanTree` | SVG, animates node replacement on AQE rewrite |
| `TaskTimeline` | Canvas Gantt, quadtree hit-test, keyboard-navigable task list as the accessible equivalent |

Not everything is a card. Border, fill, radius and shadow each say "separate object" — spend them
by role. One radius and one shadow stamped on every block flattens the hierarchy.

## 6. Copy voice

- Write from the reader's side of the screen. Name things the way an engineer says them out loud.
- Active voice. A control says exactly what happens.
- Specific beats clever. `"one key holds 52 % of the rows"` beats `"data imbalance detected"`.
- Never apologise in an error and never be vague: say what happened and what to change.
- Every module ends with the actual code diff. The prose sets up the number; the code pays it off.

## 7. What will cheapen it

Fake progress bars and loading theatre. Unlabelled axes. Cartoon mascots and spinning logos.
Numbers without units. Eleven tabs with no opinion about which matters. Claiming Spark runs in
the browser. Any one of these costs more credibility than three extra modules would buy.

## 8. Performance is part of the design

16 ms frame budget. First meaningful paint under one second on a cold cache. The first still
frame of every module must show a **realistic working state** — a loaded scenario with real
numbers, never an empty shell waiting for input.
