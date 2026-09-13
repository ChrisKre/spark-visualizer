// packages/fixtures — committed JSON + a typed loader + schema validation.
// Depends on @sas/sim for the RunResult type only — not forbidden by the ARCHITECTURE §2
// dependency rule, which constrains packages/sim, packages/viz and apps/web but says
// nothing about packages/fixtures. Documented as intentional in .dependency-cruiser.cjs.
export * from './schema';
export * from './toRunResult';
export * from './matchConfig';
export * from './snap';
export * from './loader';
export * from './resolve';
