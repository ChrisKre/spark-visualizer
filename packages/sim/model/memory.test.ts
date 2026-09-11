import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN_CONFIG } from './config';
import { asBytes } from '../types';
import { computeGcMs, estimateSpill, executionCeilingPerTask, storageFloorBytes } from './memory';

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
    const withoutStorage = executionCeilingPerTask(config, 0);
    const withStorage = executionCeilingPerTask(config, 500);
    expect(withStorage).toBeLessThan(withoutStorage);
  });

  it('never goes negative', () => {
    const config = DEFAULT_RUN_CONFIG;
    expect(executionCeilingPerTask(config, 1_000_000)).toBe(0);
  });
});

describe('storageFloorBytes', () => {
  it('is positive for a normal config', () => {
    expect(storageFloorBytes(DEFAULT_RUN_CONFIG)).toBeGreaterThan(0);
  });
});

describe('estimateSpill (SAS-014 stub)', () => {
  it('always reports zero spill and status ok', () => {
    const result = estimateSpill(asBytes(1_000_000_000), asBytes(1));
    expect(result.memorySpilledBytes).toBe(0);
    expect(result.diskSpilledBytes).toBe(0);
    expect(result.spillPenaltyMs).toBe(0);
    expect(result.status).toBe('ok');
  });
});

describe('computeGcMs (SAS-014 stub)', () => {
  it('always reports zero', () => {
    expect(computeGcMs(1.4)).toBe(0);
  });
});
