import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // tools/**/*.test.ts covers tools/generator's skew.test.ts and SAS-032's parity.test.ts
    // (E4) — coverage.include below stays scoped to packages/sim; tools/generator isn't held
    // to that 90% product gate.
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'tools/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/out/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Coverage floor applies to packages/sim, the product — docs/TECH_STACK.md CI
      // toolchain table: "simulator coverage below 90%" fails the Unit gate. Barrel
      // (index.ts) files are excluded; they are re-exports, not logic.
      include: ['packages/sim/**/*.ts'],
      exclude: ['packages/sim/**/*.test.ts', 'packages/sim/index.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
