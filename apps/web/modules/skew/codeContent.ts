// SAS-056 (E6) — content for the three CodePane tabs.
import type { RunConfig } from '@sas/sim';

// Verbatim from docs/modules/m1-skew.md §7 ("Diff tab").
export const DIFF_CODE = `# before
orders.join(zones, orders.PULocationID == zones.LocationID)

# after — salt the skewed side, explode the other
SALT = 8
orders_salted = orders.withColumn(
    "salted_key",
    F.concat_ws("_", F.col("PULocationID"), (F.rand() * SALT).cast("int")))

zones_exploded = (zones
    .withColumn("salt", F.explode(F.array([F.lit(i) for i in range(SALT)])))
    .withColumn("salted_key", F.concat_ws("_", F.col("LocationID"), F.col("salt"))))

orders_salted.join(zones_exploded, "salted_key")
`;

// docs/modules/m1-skew.md §7's EXPLAIN tab wants "real df.explain('formatted') output from
// both runs, side by side" — genuinely unavailable until a real capture session lands (every
// committed fixture is synthetic, and none carry an EXPLAIN string at all). Saying so plainly
// is the honest option; fabricating output that looks captured is not (docs/FIXTURES.md §7).
export const EXPLAIN_PLACEHOLDER = `EXPLAIN output is verbatim df.explain("formatted") text from a real Spark capture.
None is available yet: every fixture committed so far is synthetic (see BACKLOG.md's
SAS-020/023/024 capture-session follow-up), and none carry an EXPLAIN string at all.
This tab will show the real output the moment that capture session lands.`;

function confLine(key: string, value: string | number | boolean): string {
  return `${key}=${value}`;
}

function configLines(config: RunConfig): string[] {
  return [
    confLine('spark.sql.shuffle.partitions', config.sql.shufflePartitions),
    confLine('spark.executor.instances', config.cluster.executors),
    confLine('spark.sql.adaptive.enabled', config.sql.adaptive.enabled),
    '# data generation knobs (not real spark.conf keys)',
    confLine('zipfAlpha', config.data.zipfAlpha),
    confLine('saltFactor', config.data.saltFactor),
    confLine('nullFraction', config.data.nullFraction),
  ];
}

/**
 * A live diff of the actual RunConfig(s) driving the current view — not a captured
 * `spark.conf` dump (no real capture exists yet), but the true config nonetheless. With no
 * `before`, just lists the current config; in compare mode, diffs the two.
 */
export function buildConfigText(after: RunConfig, before?: RunConfig): string {
  const afterLines = configLines(after);
  if (!before) return afterLines.join('\n');

  const beforeLines = configLines(before);
  return afterLines
    .map((line, index) => {
      const beforeLine = beforeLines[index];
      return line === beforeLine ? `  ${line}` : `- ${beforeLine}\n+ ${line}`;
    })
    .join('\n');
}
