import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.generated.ts',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  {
    // React owns the DOM — packages/viz/svg must never call d3.select on a node React
    // rendered. docs/ARCHITECTURE.md §5: "This is a lint rule, not a convention — a
    // no-restricted-imports rule blocks d3-selection inside packages/viz/svg."
    files: ['packages/viz/svg/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'd3-selection',
              message:
                'React owns the DOM in packages/viz/svg. Use d3-scale/d3-shape/d3-array/d3-interpolate for computation only — see docs/ARCHITECTURE.md §5.',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      // Placeholder scaffold files intentionally export a single trivial const; real
      // per-package rule tightening happens as each package grows real content.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node-loaded CommonJS config files (Next.js requires next.config.js to be CJS unless
    // named .mjs) — require() is the correct, not the legacy, form here.
    files: ['**/*.config.js', '**/*.config.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    settings: {
      // Silenced explicitly: `react` is a dependency of apps/web and a peerDependency of
      // packages/ui and packages/viz, not of the repo root eslint resolves settings from.
      react: { version: '19.0.0' },
    },
  },
);
