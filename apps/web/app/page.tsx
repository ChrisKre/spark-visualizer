import { SIM_PACKAGE_READY, asBytes, asMiB } from '@sas/sim';
import { FIXTURES_PACKAGE_READY } from '@sas/fixtures';
import { VIZ_PACKAGE_READY } from '@sas/viz';
import { UI_PACKAGE_READY } from '@sas/ui';

// Proves the workspace graph from ARCHITECTURE.md §2 is real, not just apps/web building
// in isolation: this route imports from all four packages. Real landing-page content
// lands in SAS-075.
const packagesReady = [
  ['@sas/sim', SIM_PACKAGE_READY],
  ['@sas/viz', VIZ_PACKAGE_READY],
  ['@sas/ui', UI_PACKAGE_READY],
  ['@sas/fixtures', FIXTURES_PACKAGE_READY],
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
