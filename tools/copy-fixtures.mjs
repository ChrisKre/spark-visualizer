#!/usr/bin/env node
// SAS-054 — copies packages/fixtures/data/*.json into apps/web/public/fixtures/ so they're
// servable as static JSON at runtime (docs/ARCHITECTURE.md §6: "fixtures are fetched per
// module as static JSON, not bundled"). Also writes an index.json manifest of fixture ids,
// since the browser can't readdirSync() the way packages/fixtures/loader.ts does for Vitest.
// Run before dev/build — see apps/web/package.json's "copy-fixtures" script.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(here, '..', 'packages', 'fixtures', 'data');
const DEST_DIR = join(here, '..', 'apps', 'web', 'public', 'fixtures');

mkdirSync(DEST_DIR, { recursive: true });

const ids = readdirSync(SRC_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort();

for (const id of ids) {
  copyFileSync(join(SRC_DIR, `${id}.json`), join(DEST_DIR, `${id}.json`));
}
writeFileSync(join(DEST_DIR, 'index.json'), `${JSON.stringify(ids)}\n`);

console.log(`copy-fixtures: copied ${ids.length} fixture(s) + index.json to apps/web/public/fixtures/`);
