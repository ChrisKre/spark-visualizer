import { describe, expect, it } from 'vitest';
import { asBytes } from '../types';
import { DEFAULT_RUN_CONFIG } from './config';
import { computeGcMs, estimateSpill, evictStorage, executionCeilingPerTask, storageFloorBytes } from './memory';

describe('executionCeilingPerTask', () => {
  it('follows the documented formula', () => {
    const config = DEFAULT_RUN_CONFIG;
    const usableMiB = config.cluster.executorMemoryMiB - 300;
    const unifiedMiB = usableMiB * config.cluster.memoryFraction;
    const expectedMiB = unifiedMiB / config.cluster.coresPerExecutor;
    expect(executionCeilingPerTask(config, 0)).toBeCloseTo(expectedMiB * 1024 * 1024, 0);
  });

  it('shrinks as liveStorageMiB grows', () => {
    const config = DEFAULT_RUN_CONFIG;
    expect(executionCeilingPerTask(config, 500)).toBeLessThan(executionCeilingPerTask(config, 0));
  });

  it('never goes negative', () => {
    expect(executionCeilingPerTask(DEFAULT_RUN_CONFIG, 1_000_000)).toBe(0);
  });
});

describe('storageFloorBytes', () => {
  it('is positive for a normal config', () => {
    expect(storageFloorBytes(DEFAULT_RUN_CONFIG)).toBeGreaterThan(0);
  });
});

describe('evictStorage — the borrow/evict asymmetry', () => {
  it('execution may push storage down to the floor when it needs more', () => {
    const config = DEFAULT_RUN_CONFIG;
    const usableMiB = config.cluster.executorMemoryMiB - 300;
    const unifiedMiB = usableMiB * config.cluster.memoryFraction;
    const floorMiB = unifiedMiB * config.cluster.storageFraction;

    // Storage wants far more than is available once execution's huge demand is honoured.
    const survivingStorageMiB = evictStorage(config, /* requested */ unifiedMiB, /* execution demand */ unifiedMiB);
    expect(survivingStorageMiB).toBeCloseTo(floorMiB, 6);
  });

  it('storage is never evicted below the floor, no matter how large execution demand grows', () => {
    const config = DEFAULT_RUN_CONFIG;
    const usableMiB = config.cluster.executorMemoryMiB - 300;
    const unifiedMiB = usableMiB * config.cluster.memoryFraction;
    const floorMiB = unifiedMiB * config.cluster.storageFraction;

    const survivingStorageMiB = evictStorage(config, unifiedMiB, unifiedMiB * 1000); // absurd demand
    expect(survivingStorageMiB).toBeGreaterThanOrEqual(floorMiB - 1e-6);
  });

  it('storage alone can never evict execution: execution always keeps at least (unified - floor)', () => {
    const config = DEFAULT_RUN_CONFIG;
    const usableMiB = config.cluster.executorMemoryMiB - 300;
    const unifiedMiB = usableMiB * config.cluster.memoryFraction;
    const floorMiB = unifiedMiB * config.cluster.storageFraction;
    const guaranteedExecutionMiB = (unifiedMiB - floorMiB) / config.cluster.coresPerExecutor;

    // Even if storage requests an enormous amount, evictStorage never hands it more than
    // (unified - executionDemand), so execution's own ceiling (computed with 0 demand from
    // storage here) is untouched by storage's request in the first place.
    const survivingStorageMiB = evictStorage(config, /* requested */ 1_000_000, /* execution demand */ 0);
    const ceilingWithThatStorage = executionCeilingPerTask(config, survivingStorageMiB);
    expect(ceilingWithThatStorage / config.cluster.coresPerExecutor).toBeLessThanOrEqual(guaranteedExecutionMiB + 1e-6);
    // ...and execution asking for its guaranteed share still gets it.
    expect(executionCeilingPerTask(config, floorMiB)).toBeCloseTo(guaranteedExecutionMiB * 1024 * 1024, 0);
  });
});

describe('estimateSpill', () => {
  it('reports zero spill when peak is within the ceiling', () => {
    const result = estimateSpill(asBytes(100), asBytes(1000));
    expect(result.memorySpilledBytes).toBe(0);
    expect(result.diskSpilledBytes).toBe(0);
    expect(result.spillPenaltyMs).toBe(0);
    expect(result.status).toBe('ok');
  });

  it('spills the overflow and pays a nonzero penalty when peak exceeds the ceiling', () => {
    const result = estimateSpill(asBytes(2000), asBytes(1000));
    expect(result.memorySpilledBytes).toBe(1000);
    expect(result.diskSpilledBytes).toBeGreaterThan(0);
    expect(result.spillPenaltyMs).toBeGreaterThan(0);
    expect(result.status).toBe('spilled');
  });

  it('still returns a valid spill penalty when the ceiling itself is zero', () => {
    const result = estimateSpill(asBytes(1000), asBytes(0));
    expect(result.status).not.toBe('ok');
    expect(Number.isFinite(result.spillPenaltyMs)).toBe(true);
  });

  it('marks the task oom (a genuine, unclamped value) once spill exceeds the OOM threshold', () => {
    const ceiling = asBytes(1000);
    const result = estimateSpill(asBytes(1000 * 1_000_000), ceiling); // wildly over ceiling
    expect(result.status).toBe('oom');
    expect(result.memorySpilledBytes).toBeGreaterThan(1_000_000); // not clamped to a small number
  });
});

describe('computeGcMs', () => {
  it('is quadratic in heap pressure', () => {
    const at05 = computeGcMs(0.5);
    const at1 = computeGcMs(1.0);
    // gcMs = pressure^2 * base, so doubling pressure should roughly quadruple gcMs.
    expect(at1 / at05).toBeCloseTo(4, 1);
  });

  it('clamps heap pressure at 1.4', () => {
    expect(computeGcMs(2.0)).toBe(computeGcMs(1.4));
  });
});
