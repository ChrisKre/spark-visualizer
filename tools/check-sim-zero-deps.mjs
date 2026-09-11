#!/usr/bin/env node
// dependency-cruiser checks the *import graph*, not package.json — a stray `pnpm add` to
// packages/sim would not show up as a graph violation until the package is actually
// imported. This is the belt to that suspenders: assert packages/sim/package.json's
// dependencies (and devDependencies) stay genuinely empty.
// docs/TECH_STACK.md: "packages/sim has zero runtime dependencies and must stay that way."
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('packages/sim/package.json', 'utf8'));
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const names = Object.keys(deps);

if (names.length > 0) {
  console.error(`packages/sim/package.json must have zero dependencies. Found: ${names.join(', ')}`);
  process.exit(1);
}

console.log('check-sim-zero-deps: packages/sim has zero dependencies, clean.');
