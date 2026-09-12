// packages/fixtures — committed JSON + a typed loader + schema validation.
// Depends on @sas/sim for the RunResult type only — not forbidden by the ARCHITECTURE §2
// dependency rule, which constrains packages/sim, packages/viz and apps/web but says
// nothing about packages/fixtures. Documented as intentional in .dependency-cruiser.cjs.
// Real schema + loader land in SAS-022 (E3).
import { DEFAULT_RUN_CONFIG } from '@sas/sim';

// Proves the workspace boundary against @sas/sim's real E2 API, not a scaffold sentinel.
export const FIXTURES_PACKAGE_READY = typeof DEFAULT_RUN_CONFIG === 'object';
