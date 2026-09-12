// The one number formatter module — DESIGN_SYSTEM.md §3: "no component formats a number
// inline." Binary prefixes (MiB/GiB) for memory and partition sizes, decimal (MB/s) for
// throughput, the duration ladder, byte counts never exceeding three significant figures.
//
// Coloring/polarity ("is this delta good or bad") is deliberately NOT this module's job —
// that's MetricRibbon's `lowerIsBetter` policy layer (SAS-043). These functions only turn
// numbers into strings.

const BINARY_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const DECIMAL_THROUGHPUT_UNITS = ['B/s', 'kB/s', 'MB/s', 'GB/s'] as const;

/**
 * Formats a positive value ≥ 1 to exactly `figures` significant figures, keeping trailing
 * zeros (`2` -> "2.00", `1.5` -> "1.50", `48.2` -> "48.2") so a column of these stays
 * consistently aligned under tabular-nums, rather than d3/`toPrecision`'s habit of dropping
 * trailing zeros when round-tripped through `Number()`.
 */
function formatToSignificantFigures(value: number, figures: number): string {
  const integerDigits = Math.max(1, Math.floor(Math.log10(value)) + 1);
  const decimals = Math.max(0, figures - integerDigits);
  return value.toFixed(decimals);
}

/**
 * Formats a ladder value: below `base`, round to the whole unit; at or above it, pick the
 * largest unit whose scaled magnitude is >= 1, format to 3 significant figures, and re-check
 * whether rounding pushed the value up into the next unit (e.g. rounding 1023.6 at the KiB
 * scale must not print "1024 KiB" when "1.00 MiB" is what a human would write — the rounded
 * scaled value at the bumped unit is always in [1, ~1.001) by construction, so it's formatted
 * directly to 2 decimals rather than re-run through the digit-counting step above).
 */
function formatLadder(value: number, base: number, units: readonly string[]): string {
  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  const baseUnit = units[0] ?? '';

  if (magnitude < base) {
    return `${sign}${Math.round(magnitude)} ${baseUnit}`;
  }

  let exponent = Math.min(units.length - 1, Math.floor(Math.log(magnitude) / Math.log(base)));
  let formatted = formatToSignificantFigures(magnitude / base ** exponent, 3);

  if (Number(formatted) >= base && exponent < units.length - 1) {
    exponent += 1;
    formatted = (magnitude / base ** exponent).toFixed(2);
  }

  const unit = units[exponent] ?? units[units.length - 1] ?? baseUnit;
  return `${sign}${formatted} ${unit}`;
}

/** Binary-prefix ladder for memory and partition sizes: B / KiB / MiB / GiB / TiB. */
export function formatBytes(bytes: number): string {
  return formatLadder(bytes, 1024, BINARY_UNITS);
}

/** Decimal-prefix ladder for throughput: B/s / kB/s / MB/s / GB/s. */
export function formatThroughput(bytesPerSec: number): string {
  return formatLadder(bytesPerSec, 1000, DECIMAL_THROUGHPUT_UNITS);
}

/**
 * Duration ladder — DESIGN_SYSTEM.md §3: <1s in ms, <90s as "48.2 s", beyond 90s as "6m 21s".
 * Seconds are zero-padded in the minutes form so a column of these stays tabular-aligned.
 */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  const magnitude = Math.abs(ms);

  if (magnitude < 1000) {
    return `${sign}${Math.round(magnitude)} ms`;
  }
  if (magnitude < 90_000) {
    return `${sign}${(magnitude / 1000).toFixed(1)} s`;
  }
  const totalSeconds = Math.round(magnitude / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${sign}${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** `percent` is already on a 0-100 scale (matches RunMetrics.gcPercent's naming). */
export function formatPercent(percent: number, decimals = 1): string {
  return `${percent.toFixed(decimals)}%`;
}

/** The skew diagnostic: max(taskMs) / median(taskMs), rendered as e.g. "1.8×". */
export function formatRatio(ratio: number, decimals = 1): string {
  return `${ratio.toFixed(decimals)}×`;
}

/** Thousands-separated integer count (task counts, partition counts, idle reducers, ...). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

/**
 * Sign-prefixed delta magnitude for compare mode. Always shows a sign, even for zero, so a
 * column of deltas stays visually consistent. `magnitudeFormatter` picks the unit ladder
 * (formatBytes, formatDuration, ...) — this function only adds the sign.
 */
export function formatSignedDelta(delta: number, magnitudeFormatter: (n: number) => string): string {
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${magnitudeFormatter(Math.abs(delta))}`;
}
