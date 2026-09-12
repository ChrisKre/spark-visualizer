// SAS-022 — schema.ts tests: a valid fixture round-trips and gets its numeric fields branded;
// fixtures failing validation throw a descriptive error ("a fixture that fails validation fails
// CI" — docs/FIXTURES.md §4).
import { describe, expect, it } from 'vitest';
import { validateFixture } from './schema';

/** A minimal, self-contained fixture object — every field required by the schema, one task,
 * one stage, a single-node plan. Deliberately independent of the committed fixture JSON so this
 * test doesn't depend on generate-synthetic.ts having run. */
function buildValidFixtureJson(): Record<string, unknown> {
  const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };
  return {
    id: 'test_fixture',
    schemaVersion: 1,
    captured: '2026-09-12',
    environment: {
      sparkVersion: '3.5.0',
      runtime: 'test',
      nodes: 1,
      nodeType: 'local-docker',
      executorMemoryMiB: 8192,
      coresPerExecutor: 4,
    },
    config: { zipfAlpha: 0, saltFactor: 1, shufflePartitions: 200, aqe: false },
    notes: 'a test fixture',
    sampling: { ratio: 1 },
    stages: [
      {
        stageId: 0,
        planNodeId: 0,
        taskIds: [0],
        launchMs: 0,
        finishMs: 10,
        status: 'ok',
        partitionBytes: [1024],
      },
    ],
    tasks: [
      {
        taskId: 0,
        stageId: 0,
        slot: 0,
        partitionId: 0,
        launchMs: 0,
        finishMs: 10,
        inputBytes: 1024,
        shuffleReadBytes: 0,
        shuffleWriteBytes: 1024,
        fetchWaitMs: 0,
        gcMs: 0,
        memorySpilledBytes: 0,
        diskSpilledBytes: 0,
        peakExecutionMemoryBytes: 2048,
        status: 'ok',
        rows: 8,
      },
    ],
    plan: { initial: scanNode, final: scanNode, rewrites: [] },
    runConfig: {
      cluster: { executors: 8, coresPerExecutor: 4, executorMemoryMiB: 8192, memoryFraction: 0.6, storageFraction: 0.5 },
      sql: {
        shufflePartitions: 200,
        autoBroadcastJoinThresholdMiB: 10,
        adaptive: {
          enabled: false,
          advisoryPartitionSizeMiB: 64,
          coalescePartitions: true,
          skewJoinEnabled: true,
          skewedPartitionFactor: 5,
          skewedPartitionThresholdMiB: 256,
        },
      },
      data: { rows: 8, keyCardinality: 200, zipfAlpha: 0, nullFraction: 0, bytesPerRow: 128, saltFactor: 1 },
      query: { kind: 'aggregate' },
    },
  };
}

describe('validateFixture', () => {
  it('accepts a well-formed fixture and brands its numeric fields', () => {
    const fixture = validateFixture(buildValidFixtureJson());
    expect(fixture.id).toBe('test_fixture');
    expect(fixture.tasks[0]?.launchMs).toBe(0);
    expect(fixture.tasks[0]?.rows).toBe(8);
    expect(fixture.stages[0]?.finishMs).toBe(10);
  });

  it('defaults synthetic to false when omitted', () => {
    const fixture = validateFixture(buildValidFixtureJson());
    expect(fixture.synthetic).toBe(false);
  });

  it('round-trips an explicit synthetic:true and pairedWith', () => {
    const json = { ...buildValidFixtureJson(), synthetic: true, pairedWith: 'other_fixture' };
    const fixture = validateFixture(json);
    expect(fixture.synthetic).toBe(true);
    expect(fixture.pairedWith).toBe('other_fixture');
  });

  it('rejects a fixture missing a required field', () => {
    const json = buildValidFixtureJson();
    delete (json as Record<string, unknown>).environment;
    expect(() => validateFixture(json)).toThrow(/failed schema validation/);
  });

  it('rejects an invalid task status enum value', () => {
    const json = buildValidFixtureJson();
    (json.tasks as Array<Record<string, unknown>>)[0]!.status = 'weird';
    expect(() => validateFixture(json)).toThrow();
  });

  it('rejects a raw non-numeric byte field', () => {
    const json = buildValidFixtureJson();
    (json.tasks as Array<Record<string, unknown>>)[0]!.inputBytes = '1024';
    expect(() => validateFixture(json)).toThrow();
  });

  it('rejects the wrong schemaVersion', () => {
    const json = { ...buildValidFixtureJson(), schemaVersion: 2 };
    expect(() => validateFixture(json)).toThrow();
  });
});
