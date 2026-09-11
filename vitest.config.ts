import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
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
