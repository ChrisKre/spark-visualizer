import { DEFAULT_RUN_CONFIG, asBytes, asMiB } from '@sas/sim';
import { loadFixture } from '@sas/fixtures';
import { ChartFrame } from '@sas/viz';
import { UI_PACKAGE_READY } from '@sas/ui';

// Proves the workspace graph from ARCHITECTURE.md §2 is real, not just apps/web building
// in isolation: this route imports from all four packages. Real landing-page content
// lands in SAS-075.
const packagesReady = [
  ['@sas/sim', typeof DEFAULT_RUN_CONFIG === 'object'],
  // @sas/viz's real chart primitives landed in E5 — proves the boundary against its actual
  // API now, not a scaffold sentinel.
  ['@sas/viz', typeof ChartFrame === 'function'],
  ['@sas/ui', UI_PACKAGE_READY],
  // @sas/fixtures's real loader landed in SAS-022 (E3) — proves the boundary against its
  // actual API now, not a scaffold sentinel.
  ['@sas/fixtures', typeof loadFixture === 'function'],
] as const;

// Also exercises the branded unit types across a package boundary.
const exampleBytes = asBytes(1024 * 1024);
const exampleMiB = asMiB(1);

export default function HomePage() {
  return (
    <main>
      <h1>Shuffle &amp; Spill</h1>
      <p>Foundation scaffold — E1 in progress.</p>
      <ul>
        {packagesReady.map(([name, ready]) => (
          <li key={name}>
            {name}: {ready ? 'ready' : 'not ready'}
          </li>
        ))}
      </ul>
      <p>
        example: {exampleBytes} Bytes / {exampleMiB} MiB
      </p>
    </main>
  );
}
