#!/usr/bin/env node
// Design tokens only — a raw hex colour outside packages/ui/tokens.css fails review
// (docs/CONTRIBUTING.md, docs/DESIGN_SYSTEM.md §1). This is a plain Node script rather
// than a new lint-tool dependency (e.g. stylelint): the CI toolchain table in
// docs/TECH_STACK.md names only "ESLint + dependency-cruiser" for the Lint gate, and
// adding a new tool calls for an ADR per that doc's own policy. Swap this for stylelint in
// a follow-up if CSS-lint needs grow beyond one rule.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const HEX_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const ALLOWED_FILES = new Set([join('packages', 'ui', 'tokens.css')]);
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'out', 'dist', 'coverage', '.turbo']);

/** @param {string} dir @returns {string[]} */
function findCssFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      results.push(...findCssFiles(join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

const files = findCssFiles(ROOT);
let failed = false;

for (const file of files) {
  const relPath = relative(ROOT, file).split(sep).join('/');
  if (ALLOWED_FILES.has(relative(ROOT, file))) continue;

  const content = readFileSync(file, 'utf8');
  const matches = content.match(HEX_RE);
  if (matches) {
    failed = true;
    console.error(`${relPath}: raw hex colour(s) ${matches.join(', ')} — use a design token`);
  }
}

if (failed) {
  console.error('\nRaw hex colours found outside packages/ui/tokens.css. Use a token instead.');
  process.exit(1);
} else {
  console.log(`lint-no-raw-hex: ${files.length} CSS file(s) checked, clean.`);
}
