// SAS-022 — reads committed fixture JSON from packages/fixtures/data, validates it, and converts
// it into the same RunResult shape simulate() produces.
//
// Filesystem-backed (Node-only) — correct for Vitest, the MAE gate, and calibrate.py-adjacent
// tooling. apps/web's browser-side equivalent (SAS-054) fetches the same JSON over HTTP instead
// and imports `toRunResult` from its own file (see toRunResult.ts's header) rather than from
// here, since importing this file at all pulls in the node:fs/node:path/node:url imports below —
// unbundlable for a browser target regardless of which export is actually used.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFixture, type ValidatedFixture } from './schema';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

/** Every committed fixture id (the JSON filename minus `.json`), sorted for determinism. */
export function listFixtureIds(): string[] {
  return readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

/** Reads and validates one fixture by id. Throws if the file is missing or fails validation. */
export function loadFixture(id: string): ValidatedFixture {
  const raw = readFileSync(join(DATA_DIR, `${id}.json`), 'utf8');
  return validateFixture(JSON.parse(raw));
}
