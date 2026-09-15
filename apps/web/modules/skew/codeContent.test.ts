import { describe, expect, it } from 'vitest';
import { buildConfigText, DIFF_CODE, EXPLAIN_PLACEHOLDER } from './codeContent';
import { buildRunConfig } from './buildRunConfig';
import { KNOB_DEFAULTS } from './knobs';

describe('DIFF_CODE', () => {
  it('is the module spec\'s salt-and-explode diff, verbatim', () => {
    expect(DIFF_CODE).toContain('orders.join(zones, orders.PULocationID == zones.LocationID)');
    expect(DIFF_CODE).toContain('SALT = 8');
    expect(DIFF_CODE).toContain('orders_salted.join(zones_exploded, "salted_key")');
  });
});

describe('EXPLAIN_PLACEHOLDER', () => {
  it('says plainly that no real capture exists yet, without fabricating output', () => {
    expect(EXPLAIN_PLACEHOLDER).toMatch(/no(ne)? .*available/i);
    expect(EXPLAIN_PLACEHOLDER).not.toContain('== Physical Plan =='); // never fake real EXPLAIN syntax
  });
});

describe('buildConfigText', () => {
  it('lists the current config when there is no "before" to diff against', () => {
    const config = buildRunConfig(KNOB_DEFAULTS);
    const text = buildConfigText(config);
    expect(text).toContain(`spark.sql.shuffle.partitions=${KNOB_DEFAULTS.sp}`);
    expect(text).toContain(`saltFactor=${KNOB_DEFAULTS.salt}`);
    expect(text).not.toContain('-');
  });

  it('diffs only the lines that actually differ between before and after', () => {
    const before = buildRunConfig({ ...KNOB_DEFAULTS, salt: 1 });
    const after = buildRunConfig({ ...KNOB_DEFAULTS, salt: 8 });
    const text = buildConfigText(after, before);

    expect(text).toContain('- saltFactor=1');
    expect(text).toContain('+ saltFactor=8');
    // Untouched lines (e.g. shufflePartitions) stay as plain context, not a diff pair.
    expect(text).toContain(`  spark.sql.shuffle.partitions=${KNOB_DEFAULTS.sp}`);
    expect(text).not.toContain(`- spark.sql.shuffle.partitions`);
  });
});
