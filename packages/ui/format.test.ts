import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatPercent,
  formatRatio,
  formatSignedDelta,
  formatThroughput,
} from './format';

describe('formatBytes', () => {
  it('shows whole bytes below the KiB threshold', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('crosses into KiB at 1024', () => {
    expect(formatBytes(1024)).toBe('1.00 KiB');
  });

  it('rounds to 3 significant figures, keeping trailing zeros for alignment', () => {
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(1_536_000)).toBe('1.46 MiB');
  });

  it('handles the GiB range', () => {
    expect(formatBytes(2_147_483_648)).toBe('2.00 GiB');
  });

  it('re-checks the unit after rounding pushes past the next threshold', () => {
    // 1023.6 KiB-scale bytes round to 1.00 MiB, not "1024 KiB" / "1.02e3 KiB".
    expect(formatBytes(1023.6 * 1024)).toBe('1.00 MiB');
  });

  it('preserves sign', () => {
    expect(formatBytes(-2048)).toBe('-2.00 KiB');
  });
});

describe('formatThroughput', () => {
  it('uses decimal prefixes', () => {
    expect(formatThroughput(500)).toBe('500 B/s');
    expect(formatThroughput(1000)).toBe('1.00 kB/s');
    expect(formatThroughput(52_000_000)).toBe('52.0 MB/s');
  });
});

describe('formatDuration', () => {
  it('shows milliseconds below 1s', () => {
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(820)).toBe('820 ms');
    expect(formatDuration(999)).toBe('999 ms');
  });

  it('shows one decimal of seconds from 1s up to 90s', () => {
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(48_200)).toBe('48.2 s');
    expect(formatDuration(89_900)).toBe('89.9 s');
  });

  it('switches to minutes+seconds at 90s, zero-padded', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(381_000)).toBe('6m 21s');
    expect(formatDuration(605_000)).toBe('10m 05s');
  });

  it('preserves sign', () => {
    expect(formatDuration(-500)).toBe('-500 ms');
  });
});

describe('formatPercent', () => {
  it('defaults to one decimal', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
  });

  it('accepts a custom decimal count', () => {
    expect(formatPercent(12.345, 0)).toBe('12%');
  });
});

describe('formatRatio', () => {
  it('appends the multiplication sign', () => {
    expect(formatRatio(1.8)).toBe('1.8×');
    expect(formatRatio(12.34, 2)).toBe('12.34×');
  });
});

describe('formatCount', () => {
  it('adds thousands separators', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(formatCount(200)).toBe('200');
  });
});

describe('formatSignedDelta', () => {
  it('prefixes a plus for positive and zero deltas', () => {
    expect(formatSignedDelta(0, formatBytes)).toBe('+0 B');
    expect(formatSignedDelta(2048, formatBytes)).toBe('+2.00 KiB');
  });

  it('prefixes a minus sign for negative deltas without double-negating the magnitude', () => {
    expect(formatSignedDelta(-2048, formatBytes)).toBe('−2.00 KiB');
  });

  it('composes with any magnitude formatter', () => {
    expect(formatSignedDelta(-48_200, formatDuration)).toBe('−48.2 s');
  });
});
