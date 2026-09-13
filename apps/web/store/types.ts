// SAS-071 (E8) — the store's shape. Generic across modules on purpose (docs/ARCHITECTURE.md
// §3's data flow diagram is drawn "for one module" but the store itself isn't module-specific):
// `knobs` is a flat string-keyed map because each module owns its own knob ids (M1's are
// `a`/`salt`/`nulls`/`ex`/`sp` — the exact short keys docs/modules/m1-skew.md §3 and SAS-074's
// URL serialisation both use) and the store has no need to know what they mean.
import type { SimMs } from '@sas/sim';

export interface ClockState {
  /** The playhead, in simulated ms — see docs/ARCHITECTURE.md §4. */
  t: SimMs;
  playing: boolean;
  /** Simulated-ms-per-render-ms multiplier. */
  speed: number;
  duration: SimMs;
}

export interface AppState {
  moduleId: string;
  knobs: Record<string, number>;
  compare: boolean;
  clock: ClockState;
}

export interface AppActions {
  /** Switching modules resets knobs to the new module's defaults and the clock to zero —
   *  there is no cross-module knob or playhead carryover. */
  setModule: (moduleId: string, defaultKnobs: Record<string, number>) => void;
  setKnob: (key: string, value: number) => void;
  setKnobs: (knobs: Record<string, number>) => void;
  setCompare: (compare: boolean) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  /** Also clamps `t` down if it now exceeds the new duration. */
  setDuration: (duration: SimMs) => void;
  /** Clamped to `[0, duration]`. The one setter ClockDriver's rAF loop and the Scrubber's
   *  drag handle both call. */
  setT: (t: SimMs) => void;
  /** Clamped to `[0, duration]`. Positive or negative — the Scrubber's step buttons. */
  step: (deltaMs: SimMs) => void;
}

export type AppStore = AppState & AppActions;
