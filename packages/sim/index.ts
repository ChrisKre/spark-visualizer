// packages/sim — pure TS. No React, no DOM, no fetch, zero runtime dependencies.
// This is the only file `apps/web` (or any other package) may import from — see
// docs/ARCHITECTURE.md §2. See docs/SIMULATOR_SPEC.md for the normative contract.
export * from './types';
export { DEFAULT_RUN_CONFIG } from './model/config';
export { simulate } from './model/simulate';
// SAS-022 (E3) — packages/fixtures needs these to build a RunResult from committed fixture
// JSON (rollupMetrics/collectWarnings) and to reconstruct modeled-vs-measured costs for the
// calibration MAE gate (the constants, plus the spill/GC formulas — reused rather than
// reimplemented so the gate can never drift from the real cost model) without reaching past
// this barrel.
export { rollupMetrics, collectWarnings } from './model/metrics';
export { executionCeilingPerTask, estimateSpill, computeGcMs } from './model/memory';
export * from './calibration/constants.generated';
