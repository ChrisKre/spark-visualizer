// SAS-051 (E6) — the knob set from docs/modules/m1-skew.md §3, verbatim: ids, ranges,
// steps and defaults. Short ids double as the URL keys SAS-074's urlSync uses.
export interface KnobDef {
  id: string;
  label: string;
  /** The underlying config name/meaning, shown verbatim next to the label. */
  configKey: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const KNOB_DEFS: KnobDef[] = [
  { id: 'a', label: 'Skew (α)', configKey: 'zipfAlpha', min: 0, max: 2.2, step: 0.1, default: 1.6 },
  { id: 'salt', label: 'Salt factor', configKey: 'saltFactor (AQE rewrite)', min: 1, max: 16, step: 1, default: 1 },
  { id: 'nulls', label: 'Null keys', configKey: 'nullFraction', min: 0, max: 0.15, step: 0.01, default: 0 },
  { id: 'ex', label: 'Executors', configKey: 'spark.executor.instances', min: 2, max: 32, step: 1, default: 8 },
];

// `sp` sits behind a disclosure per the module spec: "exposed as an advanced knob ... so the
// primary control set stays at four." Bounds aren't specified there beyond the 200 default —
// 10-2000 covers the range a reader would plausibly want to try.
export const ADVANCED_KNOB_DEFS: KnobDef[] = [
  { id: 'sp', label: 'Shuffle partitions', configKey: 'spark.sql.shuffle.partitions', min: 10, max: 2000, step: 10, default: 200 },
];

export const ALL_KNOB_DEFS: KnobDef[] = [...KNOB_DEFS, ...ADVANCED_KNOB_DEFS];

export const KNOB_DEFAULTS: Record<string, number> = Object.fromEntries(
  ALL_KNOB_DEFS.map((def) => [def.id, def.default]),
);

/** A concrete (non-`| undefined`) default lookup, for callers combining a possibly-partial
 *  knobs map with its defaults under `noUncheckedIndexedAccess` — see buildRunConfig.ts. */
export function defaultFor(id: string): number {
  return ALL_KNOB_DEFS.find((def) => def.id === id)?.default ?? 0;
}
