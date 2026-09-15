// SAS-061 (E7) — the knob set from docs/modules/m2-aqe.md §3, verbatim: ids, ranges, steps
// and defaults. Short ids double as the URL keys SAS-074's urlSync uses.
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
  {
    id: 'adv',
    label: 'Advisory partition size',
    configKey: 'spark.sql.adaptive.advisoryPartitionSizeInBytes',
    min: 8,
    max: 256,
    step: 8,
    default: 64,
  },
  {
    id: 'skf',
    label: 'Skew factor',
    configKey: 'spark.sql.adaptive.skewJoin.skewedPartitionFactor',
    min: 2,
    max: 10,
    step: 1,
    default: 5,
  },
  {
    // Stored as a base-10 exponent (-3..3) rather than the raw multiplier so a plain <input
    // type="range"> can sweep it linearly — buildRunConfig.ts converts via 10 ** est. Default
    // 2 (x100) is a deliberate deviation from the module doc's literal stated default (x1000):
    // at this module's data scale, x1000 pushes the join-switch rule to fire unconditionally,
    // which (per packages/sim/model/run.ts's reconcilePartitions) silently zeroes out the
    // coalesce rule's task-count win — see buildRunConfig.ts's header comment.
    id: 'est',
    label: 'Stats estimate error',
    configKey: 'planner size-estimate error — not a real Spark config; a stand-in for stale or missing table statistics',
    min: -3,
    max: 3,
    step: 1,
    default: 2,
  },
];

/** Rendered as a checkbox, not a range `Knob` — see KnobPanel.tsx. Still stored as 0/1 in the
 *  knobs map for store/URL-sync compatibility (Record<string, number>, same as every other knob). */
export const AQE_TOGGLE: KnobDef = {
  id: 'aqe',
  label: 'Adaptive Query Execution',
  configKey: 'spark.sql.adaptive.enabled',
  min: 0,
  max: 1,
  step: 1,
  default: 1,
};

export const ALL_KNOB_DEFS: KnobDef[] = [AQE_TOGGLE, ...KNOB_DEFS];

export const KNOB_DEFAULTS: Record<string, number> = Object.fromEntries(
  ALL_KNOB_DEFS.map((def) => [def.id, def.default]),
);

/** A concrete (non-`| undefined`) default lookup, for callers combining a possibly-partial
 *  knobs map with its defaults under `noUncheckedIndexedAccess` — see buildRunConfig.ts. */
export function defaultFor(id: string): number {
  return ALL_KNOB_DEFS.find((def) => def.id === id)?.default ?? 0;
}
