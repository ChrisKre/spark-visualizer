// SAS-016 — assembles the public `simulate()` contract. See docs/SIMULATOR_SPEC.md §0.

import { applyAqeRewrites } from '../plan/aqe';
import type { RunConfig, RunResult } from '../types';
import { collectWarnings, rollupMetrics } from './metrics';
import { runQuery } from './run';

/**
 * Pure, deterministic: no I/O, no `Date.now()`, no `Math.random()`. Same `(config, seed)` always
 * produces byte-identical output.
 *
 * Always returns `provenance: 'modeled'` with `fixtureId: undefined` — fixture snapping (which
 * may override both) lives outside `packages/sim`. See docs/SIMULATOR_SPEC.md §3.
 */
export function simulate(config: RunConfig, seed: number): RunResult {
  const { stages, tasks, plan } = runQuery(config, seed, applyAqeRewrites);
  const metrics = rollupMetrics(stages, tasks);
  const warnings = collectWarnings(stages, metrics);

  return {
    provenance: 'modeled',
    stages,
    tasks,
    plan,
    metrics,
    warnings,
  };
}
