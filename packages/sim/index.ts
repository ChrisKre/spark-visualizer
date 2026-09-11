// packages/sim — pure TS. No React, no DOM, no fetch, zero runtime dependencies.
// This is the only file `apps/web` (or any other package) may import from — see
// docs/ARCHITECTURE.md §2. Real model/plan/skew/calibration modules land in E2.
export * from './types';

export const SIM_PACKAGE_READY = true as const;
