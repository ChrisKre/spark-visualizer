import { DEFAULT_RUN_CONFIG, simulate } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { buildRunConfig } from './buildRunConfig';
import { KNOB_DEFAULTS } from './knobs';

describe('buildRunConfig', () => {
  it('applies the module knob defaults, not DEFAULT_RUN_CONFIG\'s own neutral defaults', () => {
    const config = buildRunConfig(KNOB_DEFAULTS);
    expect(config.data.zipfAlpha).toBe(KNOB_DEFAULTS.a);
    expect(config.data.saltFactor).toBe(KNOB_DEFAULTS.salt);
    expect(config.data.nullFraction).toBe(KNOB_DEFAULTS.nulls);
    expect(config.cluster.executors).toBe(KNOB_DEFAULTS.ex);
    expect(config.sql.shufflePartitions).toBe(KNOB_DEFAULTS.sp);
  });

  it('leaves fields the knobs do not touch (e.g. adaptive settings) at DEFAULT_RUN_CONFIG\'s value', () => {
    const config = buildRunConfig(KNOB_DEFAULTS);
    expect(config.sql.adaptive).toEqual(DEFAULT_RUN_CONFIG.sql.adaptive);
  });

  it('scales the fact and dimension sides well past the broadcast threshold', () => {
    // DEFAULT_RUN_CONFIG's own `query.other` (265 tiny rows) sits under
    // autoBroadcastJoinThresholdMiB, which would pick a BroadcastHashJoin and never shuffle
    // the fact side at all — see buildRunConfig.ts's header comment. Guards against silently
    // reintroducing that regression.
    const config = buildRunConfig(KNOB_DEFAULTS);
    const result = simulate(config, 42);
    expect(result.plan.initial.kind).not.toBe('BroadcastHashJoin');
  });

  it('maps each knob to its RunConfig field', () => {
    const config = buildRunConfig({ a: 1.6, salt: 8, nulls: 0.03, ex: 16, sp: 400 });
    expect(config.data.zipfAlpha).toBe(1.6);
    expect(config.data.saltFactor).toBe(8);
    expect(config.data.nullFraction).toBe(0.03);
    expect(config.cluster.executors).toBe(16);
    expect(config.sql.shufflePartitions).toBe(400);
  });

  it('falls back to the knob default for any key missing from a partial knobs map', () => {
    const config = buildRunConfig({ a: 2.0 });
    expect(config.data.zipfAlpha).toBe(2.0);
    expect(config.data.saltFactor).toBe(KNOB_DEFAULTS.salt);
    expect(config.cluster.executors).toBe(KNOB_DEFAULTS.ex);
  });

  it('salting cuts the straggler ratio sharply while cpuSeconds stays flat', () => {
    // The scenario's whole reason for being tuned this way — docs/modules/m1-skew.md §5:
    // "watch the CPU-s column stay flat while wall clock explodes."
    const unsalted = simulate(buildRunConfig({ ...KNOB_DEFAULTS, salt: 1 }), 42).metrics;
    const salted = simulate(buildRunConfig({ ...KNOB_DEFAULTS, salt: 8 }), 42).metrics;
    expect(salted.stragglerRatio).toBeLessThan(unsalted.stragglerRatio / 2);
    expect(salted.wallClockMs).toBeLessThan(unsalted.wallClockMs);
    expect(Math.abs(salted.cpuSeconds - unsalted.cpuSeconds) / unsalted.cpuSeconds).toBeLessThan(0.05);
  });

  it('never mutates DEFAULT_RUN_CONFIG', () => {
    const before = JSON.stringify(DEFAULT_RUN_CONFIG);
    buildRunConfig({ a: 2.2, salt: 16, nulls: 0.15, ex: 32, sp: 2000 });
    expect(JSON.stringify(DEFAULT_RUN_CONFIG)).toBe(before);
  });
});
