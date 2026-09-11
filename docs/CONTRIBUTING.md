# Contributing

## Workflow

1. Pick a ticket from [BACKLOG.md](../BACKLOG.md). Move it to *In progress* and assign yourself.
2. Branch from `main`: `<ticket-id>-short-slug`, e.g. `SAS-014-partition-histogram`.
3. Small PRs. A PR that touches the simulator **and** the UI **and** a fixture is three PRs.
4. Every PR gets a preview deploy. Put the preview link and a screenshot (or a short clip for
   anything animated) in the description.
5. Squash-merge. The commit message is the ticket title plus the ticket id.

## Definition of done

A ticket is done when **all** of these are true. No exceptions for "it is just a small one".

- [ ] Acceptance criteria in the ticket are met, item by item.
- [ ] Types pass `tsc --noEmit` with `strict: true`. No `any`, no `@ts-expect-error` without a
      comment naming the reason.
- [ ] Unit tests cover the new logic. Simulator changes need a golden test.
- [ ] Both themes render correctly: explicit light, explicit dark, **and unstamped system**.
      Check all three; the unstamped case is the one that breaks.
- [ ] Legible at 400 px width. No horizontal scroll on `body`.
- [ ] Keyboard-operable, visible focus state, `axe` clean of serious/critical violations.
- [ ] `prefers-reduced-motion` respected.
- [ ] Every number on screen has a unit and comes from the formatter module.
- [ ] Bundle budget not exceeded (CI enforces).
- [ ] Docs updated if behaviour changed — especially SIMULATOR_SPEC.md, which is normative.

## Conventions

**TypeScript**

- `strict: true`, `noUncheckedIndexedAccess: true`.
- Branded types for units: `SimMs`, `RenderMs`, `Bytes`, `MiB`. Mixing them is a type error, and
  that is the point — unit confusion is the most likely correctness bug in this codebase.
- No default exports except Next.js pages.
- `packages/sim` has **zero runtime dependencies** and no DOM or React imports. This is enforced
  by `dependency-cruiser`.

**React**

- Store access by selector only. `useStore()` with no selector fails review.
- Components in `packages/viz` receive data as props and know nothing about the store.
- No `useEffect` for derived state. If you are syncing state to state, restructure.

**CSS**

- Design tokens only. A raw hex outside `tokens.css` fails review.
- Every token defined in the bare `:root` block before any media or `[data-theme]` block
  redefines it. A token defined only inside a theme block is a bug.
- Layout with flex/grid `gap`, not per-element margins.

**Numbers**

- Binary prefixes (`MiB`, `GiB`) for memory and partition sizes; decimal (`MB/s`) for throughput.
- One formatter module. Nothing formats inline.

## Simulator changes

The simulator is the product. Changes to it need more care than UI work.

1. Update [SIMULATOR_SPEC.md](./SIMULATOR_SPEC.md) **first**. The spec is normative; the code
   follows it.
2. Add or update golden tests. If a golden snapshot changes, the PR description must explain why
   the old output was wrong.
3. Re-run calibration if a cost term changed:
   `python tools/capture/calibrate.py --fixtures packages/fixtures/data --out packages/sim/calibration/constants.generated.ts`
4. State the residual movement in the PR: *"stage wall-clock MAE 7.8 % → 8.1 %"*. CI fails above
   12 %.
5. Never hand-edit `constants.generated.ts`.

## Fixture changes

See [FIXTURES.md](./FIXTURES.md). Additional rules for review:

- A fixture PR includes the capture script, the environment block, and the reduced JSON.
- Never smooth task-level data. The jitter is the evidence.
- Fixtures must validate against `packages/fixtures/schema.ts` (CI gate).
- Adding a fixture usually means re-running calibration. Do it in the same PR.

## Performance gates

| Gate | Threshold |
|---|---|
| First-load JS on `/` | ≤ 160 kB gzipped |
| Fixture JSON, each | ≤ 400 kB gzipped |
| Playback frame time, M1 scenario | p95 ≤ 16 ms over 10 s |
| First meaningful paint, cold cache, mid-range mobile | ≤ 1 s |

If a change breaks a gate, fix the change or raise the gate in a PR of its own with a reason.
Do not bundle a budget increase into a feature PR.

## Copy review

Copy is part of the deliverable, not an afterthought. Before merging anything with user-facing
text, check it against [DESIGN_SYSTEM.md §6](./DESIGN_SYSTEM.md#6-copy-voice). In particular:
nothing may imply Spark is executing in the browser, and no panel may show `MEASURED` unless a
fixture was genuinely used.
