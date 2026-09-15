import { DEFAULT_RUN_CONFIG } from '@sas/sim';
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

  it('leaves every field the knobs do not touch at DEFAULT_RUN_CONFIG\'s value', () => {
    const config = buildRunConfig(KNOB_DEFAULTS);
    expect(config.data.rows).toBe(DEFAULT_RUN_CONFIG.data.rows);
    expect(config.sql.adaptive).toEqual(DEFAULT_RUN_CONFIG.sql.adaptive);
    expect(config.query).toEqual(DEFAULT_RUN_CONFIG.query);
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

  it('never mutates DEFAULT_RUN_CONFIG', () => {
    const before = JSON.stringify(DEFAULT_RUN_CONFIG);
    buildRunConfig({ a: 2.2, salt: 16, nulls: 0.15, ex: 32, sp: 2000 });
    expect(JSON.stringify(DEFAULT_RUN_CONFIG)).toBe(before);
  });
});
