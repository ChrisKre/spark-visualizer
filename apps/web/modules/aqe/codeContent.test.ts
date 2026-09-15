import { simulate } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { buildConfigText, buildPlanDiffText, EXPLAIN_PLACEHOLDER } from './codeContent';
import { buildRunConfig } from './buildRunConfig';
import { KNOB_DEFAULTS } from './knobs';

describe('buildConfigText', () => {
  it('lists the live config as spark.conf.set(...) lines, single-run', () => {
    const text = buildConfigText(buildRunConfig(KNOB_DEFAULTS));
    expect(text).toContain('spark.conf.set("spark.sql.adaptive.enabled", "true")');
    expect(text).toContain('spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "64MB")');
    expect(text).toContain('spark.conf.set("spark.sql.adaptive.skewJoin.skewedPartitionFactor", "5")');
  });

  it('labels the est knob as a module-only, non-Spark config in a comment', () => {
    const text = buildConfigText(buildRunConfig(KNOB_DEFAULTS));
    expect(text).toContain('estimateErrorFactor=100');
    expect(text).toContain('not a real Spark config');
  });

  it('diffs before vs after once a "before" config is given', () => {
    const after = buildRunConfig(KNOB_DEFAULTS);
    const before = buildRunConfig({ ...KNOB_DEFAULTS, aqe: 0 });
    const text = buildConfigText(after, before);
    expect(text).toContain('- spark.conf.set("spark.sql.adaptive.enabled", "false")');
    expect(text).toContain('+ spark.conf.set("spark.sql.adaptive.enabled", "true")');
  });
});

describe('EXPLAIN_PLACEHOLDER', () => {
  it('says plainly that no real capture exists yet, rather than fabricating output', () => {
    expect(EXPLAIN_PLACEHOLDER).toMatch(/none is available yet/i);
    expect(EXPLAIN_PLACEHOLDER).not.toMatch(/== Physical Plan ==/);
  });
});

describe('buildPlanDiffText', () => {
  it('stacks the initial and final plan as two labeled text blocks', () => {
    const result = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
    const text = buildPlanDiffText(result.plan.initial, result.plan.final);
    expect(text).toContain('# Initial physical plan');
    expect(text).toContain('# Final physical plan (after AQE)');
  });

  it('renders node kinds as human labels, indented by depth', () => {
    const result = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
    const text = buildPlanDiffText(result.plan.initial, result.plan.final);
    // The initial plan is a shuffle-based join (see buildRunConfig.test.ts's own guard against
    // a trivial broadcast) — its root always has an indented child line beneath it.
    expect(text).toMatch(/\n {2}\S/);
  });
});
