import { DEFAULT_RUN_CONFIG, simulate } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { buildRunConfig } from './buildRunConfig';
import { KNOB_DEFAULTS } from './knobs';

describe('buildRunConfig', () => {
  it('applies the module knob defaults, not DEFAULT_RUN_CONFIG\'s own neutral defaults', () => {
    const config = buildRunConfig(KNOB_DEFAULTS);
    expect(config.sql.adaptive.enabled).toBe(true);
    expect(config.sql.adaptive.advisoryPartitionSizeMiB).toBe(64);
    expect(config.sql.adaptive.skewedPartitionFactor).toBe(5);
    expect(config.query.kind).toBe('join');
    if (config.query.kind === 'join') {
      expect(config.query.estimateErrorFactor).toBe(100);
    }
  });

  it('maps each knob to its RunConfig field', () => {
    const config = buildRunConfig({ aqe: 0, adv: 32, skf: 3, est: -1 });
    expect(config.sql.adaptive.enabled).toBe(false);
    expect(config.sql.adaptive.advisoryPartitionSizeMiB).toBe(32);
    expect(config.sql.adaptive.skewedPartitionFactor).toBe(3);
    expect(config.query.kind).toBe('join');
    if (config.query.kind === 'join') {
      expect(config.query.estimateErrorFactor).toBeCloseTo(0.1);
    }
  });

  it('falls back to the knob default for any key missing from a partial knobs map', () => {
    const config = buildRunConfig({ skf: 2 });
    expect(config.sql.adaptive.skewedPartitionFactor).toBe(2);
    expect(config.sql.adaptive.enabled).toBe(true);
    expect(config.sql.adaptive.advisoryPartitionSizeMiB).toBe(64);
  });

  it('sizes the fact and dimension sides so the planner picks a shuffle-based join at accurate estimates, never a trivial broadcast on both sides', () => {
    // Guards against silently reintroducing DEFAULT_RUN_CONFIG's own regression (see the
    // header comment above and skew/buildRunConfig.ts's identical guard) — the fact side must
    // still shuffle so AQE's coalesce/skew rules have an Exchange to act on.
    const config = buildRunConfig(KNOB_DEFAULTS);
    const result = simulate(config, 42);
    expect(result.plan.initial.kind).not.toBe('BroadcastHashJoin');
  });

  it('never mutates DEFAULT_RUN_CONFIG', () => {
    const before = JSON.stringify(DEFAULT_RUN_CONFIG);
    buildRunConfig({ aqe: 0, adv: 256, skf: 10, est: 3 });
    expect(JSON.stringify(DEFAULT_RUN_CONFIG)).toBe(before);
  });

  describe('rewrite discoverability (locks in the tuned scenario numbers)', () => {
    it('at knob defaults, only coalesceShufflePartitions fires — a real task-count win', () => {
      const result = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
      expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['coalesceShufflePartitions']);
    });

    it('turning skf down to its minimum additionally fires optimizeSkewedJoin', () => {
      const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, skf: 2 }), 42);
      expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['optimizeSkewedJoin', 'coalesceShufflePartitions']);
    });

    it('turning est up to its maximum additionally fires dynamicJoinSelection', () => {
      const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, est: 3 }), 42);
      expect(result.plan.rewrites.map((r) => r.rule)).toEqual(['coalesceShufflePartitions', 'dynamicJoinSelection']);
    });

    it('turning est down to 0 (accurate estimate) picks a BroadcastHashJoin at plan time, with nothing for AQE to fix', () => {
      const result = simulate(buildRunConfig({ ...KNOB_DEFAULTS, est: 0 }), 42);
      expect(result.plan.initial.kind).toBe('BroadcastHashJoin');
      expect(result.plan.rewrites).toEqual([]);
    });

    it('aqe off produces zero rewrites and an unchanged (higher) task count than aqe on at defaults', () => {
      const on = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
      const off = simulate(buildRunConfig({ ...KNOB_DEFAULTS, aqe: 0 }), 42);
      expect(off.plan.rewrites).toEqual([]);
      expect(off.plan.initial).toEqual(off.plan.final);
      expect(on.tasks.length).toBeLessThan(off.tasks.length);
    });
  });
});
