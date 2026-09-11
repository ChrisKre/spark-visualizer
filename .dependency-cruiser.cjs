// Package boundary rules — encodes docs/ARCHITECTURE.md §2's dependency rule verbatim:
// `apps/web -> packages/{ui,viz,sim,fixtures}`; `packages/viz -> packages/ui`;
// `packages/sim -> nothing`. Any edge pointing the other way fails the build.
//
// Note: packages/fixtures -> packages/sim (for the RunResult type) is intentionally NOT
// forbidden here. The stated rule constrains packages/sim, packages/viz and apps/web; it
// says nothing about packages/fixtures, so that edge is allowed by design.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      // Matches both a resolved file path (packages/viz/index.ts, when the illegitimate
      // dependency is actually declared and pnpm symlinked it) and the bare, unresolved
      // specifier (@sas/viz, the common case — packages/sim declares no workspace deps at
      // all, so pnpm's strict node_modules never even exposes it to resolve).
      name: 'sim-zero-workspace-deps',
      comment:
        'packages/sim is pure TS with zero runtime dependencies — it may not import any other workspace package.',
      severity: 'error',
      from: { path: '^packages/sim' },
      to: { path: '^(packages/(ui|viz|fixtures)|apps/web|@sas/(ui|viz|fixtures))' },
    },
    {
      name: 'sim-no-react-or-dom',
      comment: 'packages/sim has zero React and zero DOM imports (docs/ARCHITECTURE.md §1 principle 2).',
      severity: 'error',
      from: { path: '^packages/sim' },
      to: { path: '^(react|react-dom)$' },
    },
    {
      name: 'viz-only-imports-ui',
      comment: 'packages/viz may depend only on packages/ui within the workspace.',
      severity: 'error',
      from: { path: '^packages/viz' },
      to: { path: '^(packages/(sim|fixtures)|apps/web|@sas/(sim|fixtures))' },
    },
    {
      name: 'ui-imports-nothing-internal',
      comment: 'packages/ui is the base of the dependency graph.',
      severity: 'error',
      from: { path: '^packages/ui' },
      to: { path: '^(packages/(sim|viz|fixtures)|apps/web|@sas/(sim|viz|fixtures))' },
    },
    {
      name: 'no-reverse-into-apps-web',
      comment: 'Nothing in packages/ or tools/ may import from apps/web.',
      severity: 'error',
      from: { path: '^(packages|tools)' },
      to: { path: '^apps/web' },
    },
    {
      name: 'no-d3-selection-in-viz-svg',
      comment:
        'React owns the DOM. packages/viz/svg must never call d3.select on a node React rendered (docs/ARCHITECTURE.md §5).',
      severity: 'error',
      from: { path: '^packages/viz/svg' },
      to: { path: '^d3-selection$' },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make the package graph impossible to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|out|\\.next|coverage|node_modules)(/|$)' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
