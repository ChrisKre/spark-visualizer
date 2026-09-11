// packages/sim — pure TS. No React, no DOM, no fetch, zero runtime dependencies.
// This is the only file `apps/web` (or any other package) may import from — see
// docs/ARCHITECTURE.md §2. See docs/SIMULATOR_SPEC.md for the normative contract.
export * from './types';
export { DEFAULT_RUN_CONFIG } from './model/config';
export { simulate } from './model/simulate';
