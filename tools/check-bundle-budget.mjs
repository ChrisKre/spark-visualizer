#!/usr/bin/env node
// First-load JS for `/` must stay under 160 kB gzipped (docs/CONTRIBUTING.md performance
// gates; docs/ARCHITECTURE.md §6). Rather than reverse-engineering webpack stats internals,
// this parses Next's own build-summary table — the exact "First Load JS" figure the budget
// is defined against, and already gzip-compressed.
//
// Expected input (via stdin), one line per route, e.g.:
//   ┌ ○ /                                      122 B         103 kB
// Usage: pnpm build | node tools/check-bundle-budget.mjs
//    or: node tools/check-bundle-budget.mjs < build-output.txt
import { readFileSync } from 'node:fs';

const BUDGET_KB = 160;
const ROUTE = '/';

const input = readFileSync(0, 'utf8');
const lineRe = /^[┌├└]\s+[○●]\s+(\S+)\s{2,}([\d.]+\s?\w+)\s{2,}([\d.]+\s?\w+)\s*$/;

let rootLine = null;
for (const line of input.split('\n')) {
  const match = line.match(lineRe);
  if (match && match[1] === ROUTE) {
    rootLine = match;
    break;
  }
}

if (!rootLine) {
  console.error(
    "check-bundle-budget: could not find a build-summary row for route '/' in the piped build output.\n" +
      'Did `next build` run and print its route table? (Run: pnpm build | node tools/check-bundle-budget.mjs)',
  );
  process.exit(1);
}

const firstLoadRaw = rootLine[3].trim();
const [, valueStr, unit] = firstLoadRaw.match(/^([\d.]+)\s?(\w+)$/) ?? [];
const value = Number(valueStr);

let valueInKb;
if (unit === 'B') valueInKb = value / 1024;
else if (unit === 'kB') valueInKb = value;
else if (unit === 'MB') valueInKb = value * 1024; // always over budget; exact base doesn't matter
else {
  console.error(`check-bundle-budget: unrecognised unit "${unit}" in "${firstLoadRaw}"`);
  process.exit(1);
}

console.log(`First Load JS for '/': ${firstLoadRaw} (budget: ${BUDGET_KB} kB)`);

if (valueInKb > BUDGET_KB) {
  console.error(
    `check-bundle-budget: FAIL — first-load JS for '/' is ${firstLoadRaw}, over the ${BUDGET_KB} kB budget.\n` +
      'Fix the change, or raise the budget in a PR of its own with a reason (docs/CONTRIBUTING.md).',
  );
  process.exit(1);
}

console.log('check-bundle-budget: PASS');
