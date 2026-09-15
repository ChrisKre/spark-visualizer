// SAS-055 (E6) — the null-trap preset's knob values and detection, kept separate from copy.ts
// (which is just strings) and knobs.ts (which is the general knob catalogue, not this one
// specific scenario).
export const NULL_TRAP_PRESET_KNOBS: Record<string, number> = { a: 0, nulls: 0.03, salt: 1 };

/** Whether the current knobs are (at least) in the null-trap's shape — a uniform key with a
 *  real null fraction — regardless of how the reader got there (the preset button, a
 *  permalink, or just dragging the sliders there themselves). */
export function isNullTrapActive(knobs: Record<string, number>): boolean {
  return (knobs.a ?? 0) === 0 && (knobs.nulls ?? 0) > 0;
}
