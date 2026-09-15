// SAS-065 (E7) — content for the three CodePane tabs.
import type { PlanNode, RunConfig } from '@sas/sim';
import { renderPlanText } from './planText';

// docs/modules/m2-aqe.md §7's EXPLAIN tab wants verbatim captured `AdaptiveSparkPlan
// (isFinalPlan=true)` output from a real Spark run. Genuinely unavailable until a real capture
// session lands: every fixture committed so far is synthetic (SAS-020/023/024's follow-up),
// and none carry an EXPLAIN string at all — the same situation skew/codeContent.ts's own
// EXPLAIN_PLACEHOLDER already lives with. Saying so plainly is the honest option; fabricating
// output that looks captured is not (docs/FIXTURES.md §7).
export const EXPLAIN_PLACEHOLDER = `EXPLAIN output is verbatim AdaptiveSparkPlan(isFinalPlan=true) text from a real Spark capture.
None is available yet: every fixture committed so far is synthetic (see BACKLOG.md's
SAS-020/023/024 capture-session follow-up), and none carry an EXPLAIN string at all.
This tab will show the real output the moment that capture session lands.`;

function confLine(key: string, value: string | number | boolean): string {
  return `spark.conf.set("${key}", "${value}")`;
}

// Verbatim keys from docs/modules/m2-aqe.md §7's Config tab, each driven by the live RunConfig
// rather than a static dump — same "true config, not a captured spark.conf" framing
// skew/codeContent.ts's buildConfigText already established.
function configLines(config: RunConfig): string[] {
  const estimateErrorFactor = config.query.kind === 'join' ? (config.query.estimateErrorFactor ?? 1) : 1;
  return [
    confLine('spark.sql.adaptive.enabled', config.sql.adaptive.enabled),
    confLine('spark.sql.adaptive.coalescePartitions.enabled', config.sql.adaptive.coalescePartitions),
    confLine('spark.sql.adaptive.advisoryPartitionSizeInBytes', `${config.sql.adaptive.advisoryPartitionSizeMiB}MB`),
    confLine('spark.sql.adaptive.skewJoin.enabled', config.sql.adaptive.skewJoinEnabled),
    confLine('spark.sql.adaptive.skewJoin.skewedPartitionFactor', config.sql.adaptive.skewedPartitionFactor),
    confLine('spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes', `${config.sql.adaptive.skewedPartitionThresholdMiB}MB`),
    '# module-only knob, not a real Spark config (stands in for stale table statistics):',
    `# estimateErrorFactor=${estimateErrorFactor}`,
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

/**
 * The Diff tab: M2 has no application-code diff (the pedagogical point is that the PLAN
 * changes, the code doesn't — docs/modules/m2-aqe.md §8), and the Config tab already covers
 * the AQE-off-vs-on config diff. Instead: the physical plan itself, stacked before/after rather
 * than line-diffed — the tree shape genuinely changes (nodes removed, ids renumbered), so a
 * naive line-diff would misalign and mislead.
 */
export function buildPlanDiffText(initial: PlanNode, final: PlanNode): string {
  return ['# Initial physical plan', renderPlanText(initial), '', '# Final physical plan (after AQE)', renderPlanText(final)].join(
    '\n',
  );
}
