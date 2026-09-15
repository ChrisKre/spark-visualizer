// SAS-022 — loader.ts tests, run against the 15 committed fixtures (generate-synthetic.ts's
// output — see SAS-023/024). Regenerate with `pnpm --filter @sas/fixtures run generate:synthetic`
// if these fail after a schema change.
import { describe, expect, it } from 'vitest';
import { listFixtureIds, loadFixture } from './loader';
import { toRunResult } from './toRunResult';

const EXPECTED_IDS = [
  'm1_a00_s1',
  'm1_a08_s1',
  'm1_a12_s1',
  'm1_a16_null3',
  'm1_a16_s1',
  'm1_a16_s4',
  'm1_a16_s8',
  'm1_a20_s8',
  'm2_adv256',
  'm2_adv8',
  'm2_all',
  'm2_coalesce_only',
  'm2_join_switch',
  'm2_off',
  'm2_skew_split',
].sort();

describe('listFixtureIds', () => {
  it('lists exactly the 15-fixture M1+M2 grid, sorted', () => {
    expect(listFixtureIds()).toEqual(EXPECTED_IDS);
  });
});

describe('loadFixture + toRunResult', () => {
  it.each(EXPECTED_IDS)('%s round-trips into a well-formed RunResult', (id) => {
    const fixture = loadFixture(id);
    expect(fixture.id).toBe(id);
    expect(fixture.synthetic).toBe(true);

    const result = toRunResult(fixture);
    expect(result.provenance).toBe('measured');
    expect(result.fixtureId).toBe(id);
    expect(result.tasks.length).toBeGreaterThan(0);

    // Every task field a RunResult task carries; `rows` (fixture-only) must be stripped.
    expect(result.tasks[0]).not.toHaveProperty('rows');

    for (const stage of result.stages) {
      const maxTaskFinish = Math.max(...stage.taskIds.map((taskId) => result.tasks.find((t) => t.taskId === taskId)?.finishMs ?? 0));
      expect(stage.finishMs).toBeGreaterThanOrEqual(maxTaskFinish);
    }
  });

  it('sets pairedWith correctly on the M1 hero pair', () => {
    const before = loadFixture('m1_a16_s1');
    const after = loadFixture('m1_a16_s8');
    expect(before.pairedWith).toBe('m1_a16_s8');
    expect(after.pairedWith).toBe('m1_a16_s1');
  });
});
