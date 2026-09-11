# App state, the clock, and permalinks

## 1. Store shape

One Zustand store per module route, created in `apps/web/store/createModuleStore.ts`.

```ts
interface ModuleState {
  moduleId: ModuleId;

  // knobs — the only user-authored state
  knobs: Record<KnobId, number | boolean>;

  // derived, recomputed when knobs change (memoised)
  run: RunResult | null;
  baseline: RunResult | null;      // the "before" pane in comparison mode
  status: 'idle' | 'computing' | 'ready' | 'error';

  // playback
  clock: { t: SimMs; playing: boolean; speed: number; duration: SimMs };

  // view
  compare: boolean;                // before/after split
  selectedTaskId: number | null;   // drives tooltip + detail pane

  setKnob(id: KnobId, value: number | boolean): void;
  play(): void; pause(): void; seek(t: SimMs): void; step(dir: 1 | -1): void;
  reset(): void;
}
```

Rules:

- **Knobs are the only source of truth.** Everything else is derived. If you find yourself
  storing a derived value to "keep it in sync", you have a bug.
- `run` is recomputed in a `useMemo`-equivalent selector. Simulation for the MVP scenarios costs
  under 8 ms; anything that grows past the frame budget moves to a Web Worker with a
  `structuredClone` boundary (a v2 ticket exists for this).
- Components subscribe with **selectors**, never the whole store. `useStore(s => s.clock.t)` is
  fine; `useStore()` is a review rejection.

## 2. The virtual clock

A single `<ClockDriver>` per route runs one `requestAnimationFrame` loop:

```ts
const dt = (now - last) * speed;
set(s => ({ clock: { ...s.clock, t: Math.min(s.clock.t + dt, s.clock.duration) } }));
```

- `t` is in **simulated milliseconds**. A 6-minute stage plays in about 12 s at `speed = 30`.
- When `t` reaches `duration`, playback stops at the final frame. It does not loop — an
  auto-looping animation reads as decoration.
- `prefers-reduced-motion: reduce` → the driver never starts, `t` is pinned to `duration`, and
  the scrubber plus step buttons remain fully usable.
- Nothing else in the app may call `requestAnimationFrame` except `packages/viz/canvas`, which
  draws inside the same frame it is given.

### Playback controls

| Control | Behaviour |
|---|---|
| Play / Pause | space bar, and a real button |
| Scrub | pointer drag and arrow keys on a labelled `<input type="range">` |
| Step | `,` / `.` — advances by one task-completion event, not a fixed dt |
| Speed | 0.25× / 1× / 4×, persisted per session in `sessionStorage` |

## 3. URL serialisation — every scenario is a permalink

The knob set round-trips through the query string. This is worth an afternoon and it pays for
itself three ways: shareable scenarios, LinkedIn posts that link to the *broken* configuration,
and free reproduction steps in bug reports.

```
/m/skew?a=1.6&salt=1&nulls=0.03&ex=8&sp=200&cmp=1&t=0.42
```

Rules:

- **Short keys.** Declared once per module in its `knobs.ts`, alongside bounds and defaults.
- **Lossy is fine.** Numbers are rounded to the precision the slider actually offers, so the URL
  stays readable.
- **Defaults are omitted.** A URL only carries what differs from the module default, so the
  canonical link is clean.
- Writing uses `history.replaceState` on a 250 ms trailing debounce, so dragging a slider does
  not spam the history stack.
- Reading happens once on mount. Unknown or out-of-range keys are dropped with a console warning,
  never an error page — an old link must still open something sensible.
- `t` is stored as a **fraction** of duration (0–1), so a link survives a change to the model
  that shifts absolute durations.

## 4. Comparison mode

`compare: true` renders two panes sharing one clock and one scale. The baseline config is
declared per module (`module.baselineKnobs`), not captured from wherever the user happened to be.

The metric ribbon in comparison mode shows three columns: **before**, **after**, **delta**, with
the delta signed and coloured by whether lower is better for that metric. Deltas are never
computed across different provenance without saying so — if before is `MEASURED` and after is
`MODELED`, the ribbon shows both badges.

## 5. Error and edge states

| State | UI |
|---|---|
| Simulated job OOMs | the stage renders as failed, ribbon shows the failure, copy explains which limit was crossed. **Do not** clamp to a plausible number. |
| Fixture fetch fails | fall back to the model, badge flips to `MODELED`, a quiet notice explains why |
| Knob combination is nonsensical (e.g. salt > cardinality) | the slider clamps and the label explains; no silent correction |
| DuckDB unavailable (old browser) | query pane shows a static pre-computed result table, labelled as such |

## 6. Analytics

Plausible or equivalent, cookieless, no PII. Track only: module opened, knob first-touched,
comparison toggled, permalink copied, challenge completed. The point is to learn which module is
worth building next — not to build a funnel.
