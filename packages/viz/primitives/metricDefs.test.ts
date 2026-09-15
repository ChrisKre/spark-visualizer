import { describe, expect, it } from 'vitest';
import { DEFAULT_METRICS, TASK_COUNT_METRIC } from './metricDefs';

describe('DEFAULT_METRICS', () => {
  it('is in the fixed BACKLOG order: wall clock · CPU-s · straggler ratio · shuffle read · disk spilled · GC %', () => {
    expect(DEFAULT_METRICS.map((m) => m.key)).toEqual([
      'wallClockMs',
      'cpuSeconds',
      'stragglerRatio',
      'shuffleReadBytes',
      'diskSpilledBytes',
      'gcPercent',
    ]);
  });

  it('marks only cpuSeconds as always visible', () => {
    const alwaysVisible = DEFAULT_METRICS.filter((m) => m.alwaysVisible).map((m) => m.key);
    expect(alwaysVisible).toEqual(['cpuSeconds']);
  });

  it('marks every metric lower-is-better', () => {
    expect(DEFAULT_METRICS.every((m) => m.lowerIsBetter)).toBe(true);
  });

  it('formats each metric with a unit-bearing string', () => {
    expect(DEFAULT_METRICS.find((m) => m.key === 'wallClockMs')?.format(48_200)).toBe('48.2 s');
    expect(DEFAULT_METRICS.find((m) => m.key === 'cpuSeconds')?.format(120)).toBe('2m 00s');
    expect(DEFAULT_METRICS.find((m) => m.key === 'stragglerRatio')?.format(1.8)).toBe('1.8×');
    expect(DEFAULT_METRICS.find((m) => m.key === 'gcPercent')?.format(12.3)).toBe('12.3%');
  });
});

describe('TASK_COUNT_METRIC', () => {
  it('is not part of DEFAULT_METRICS — M1\'s own ribbon stays at six metrics', () => {
    expect(DEFAULT_METRICS.some((m) => m.key === 'taskCount')).toBe(false);
  });

  it('formats a thousands-separated, lower-is-better count', () => {
    expect(TASK_COUNT_METRIC.lowerIsBetter).toBe(true);
    expect(TASK_COUNT_METRIC.format(1234)).toBe('1,234');
  });
});
