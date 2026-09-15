'use client';

// SAS-060...065 (E7) — scaffold, knobs, the plan tree wired to a live run, the partition
// strip, the AQE off/on compare mode, and the code pane.
import { CodePane, Scrubber } from '@sas/ui';
import { Badge, MetricRibbon, PartitionStrip, PlanTree, RunWarnings, TaskTimeline } from '@sas/viz';
import { asSimMs, type RunResult } from '@sas/sim';
import { useEffect, useId, type JSX } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions, useClock, useCompare, useKnobs } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';
import { buildConfigText, buildPlanDiffText, EXPLAIN_PLACEHOLDER } from './codeContent';
import { FIXTURE_FETCH_NOTICE, SETUP, TITLE } from './copy';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';
import { deriveAfterPartitionBytes } from './partitionStripCells';
import { toMetricValues, AQE_METRICS } from './toMetricValues';
import { toTimelineTasks } from './toTimelineTasks';
import { useAqeRun } from './useAqeRun';
import styles from './AqeModule.module.css';

function PlanTreePane({ label, run, currentMs }: { label: string; run: RunResult; currentMs: number }): JSX.Element {
  return (
    <div className={styles.planTreePane}>
      <div className={styles.planTreePaneHeader}>
        <span>{label}</span>
      </div>
      <PlanTree initial={run.plan.initial} final={run.plan.final} rewrites={run.plan.rewrites} currentMs={currentMs} />
    </div>
  );
}

function TimelinePane({ label, run, currentMs, domainMs }: { label?: string; run: RunResult; currentMs: number; domainMs: [number, number] }): JSX.Element {
  return (
    <div className={styles.timelinePane}>
      <div className={styles.timelinePaneHeader}>
        {label ? <span>{label}</span> : null}
        <Badge provenance={run.provenance} />
      </div>
      <TaskTimeline tasks={toTimelineTasks(run.tasks)} currentMs={currentMs} domainMs={domainMs} />
    </div>
  );
}

export function AqeModule(): JSX.Element {
  const { setModule, play, pause, setSpeed, step, setT, setCompare } = useAppActions();
  const clock = useClock();
  const compare = useCompare();
  const knobs = useKnobs();
  const compareToggleId = useId();

  useEffect(() => {
    setModule('aqe', KNOB_DEFAULTS);
  }, [setModule]);

  const { after, before, fixturesUnavailable } = useAqeRun();
  const domainMs: [number, number] = [0, Math.max(1, clock.duration)];
  const stage0Bytes = after.stages[0]?.partitionBytes ?? [];

  // Cheap, pure re-derivation (no simulate() call) — useAqeRun already computed the RunResult
  // side of this; the CodePane's Config tab just needs the RunConfig itself.
  const configText = buildConfigText(buildRunConfig(knobs), before ? buildRunConfig({ ...knobs, aqe: 0 }) : undefined);
  const diffText = buildPlanDiffText(after.plan.initial, after.plan.final);

  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />
      {fixturesUnavailable ? <p className={styles.fixtureNotice}>{FIXTURE_FETCH_NOTICE}</p> : null}

      <div className={styles.runHeader}>
        <label className={styles.compareToggle} htmlFor={compareToggleId}>
          <input
            id={compareToggleId}
            type="checkbox"
            checked={compare}
            onChange={(event) => setCompare(event.target.checked)}
          />
          Compare AQE off/on
        </label>
        <Scrubber
          t={clock.t}
          duration={clock.duration}
          playing={clock.playing}
          speed={clock.speed}
          onPlayPause={() => (clock.playing ? pause() : play())}
          onStep={(deltaMs) => step(asSimMs(deltaMs))}
          onScrub={(t) => setT(asSimMs(t))}
          onSpeedChange={setSpeed}
        />
      </div>

      {before ? (
        <>
          <div className={styles.planTrees}>
            <PlanTreePane label="AQE off" run={before} currentMs={clock.t} />
            <PlanTreePane label="AQE on" run={after} currentMs={clock.t} />
          </div>

          <PartitionStrip
            before={{ label: 'Before', partitionBytes: stage0Bytes }}
            after={{ label: 'After', partitionBytes: deriveAfterPartitionBytes(stage0Bytes, after.plan.rewrites) }}
          />

          <div className={styles.timelines}>
            <TimelinePane label="AQE off" run={before} currentMs={clock.t} domainMs={domainMs} />
            <TimelinePane label="AQE on" run={after} currentMs={clock.t} domainMs={domainMs} />
          </div>

          <MetricRibbon mode="compare" before={toMetricValues(before)} after={toMetricValues(after)} metrics={AQE_METRICS} />
          <RunWarnings warnings={before.warnings} label="AQE off" />
          <RunWarnings warnings={after.warnings} label="AQE on" />
        </>
      ) : (
        <>
          <PlanTree
            initial={after.plan.initial}
            final={after.plan.final}
            rewrites={after.plan.rewrites}
            currentMs={clock.t}
          />

          <PartitionStrip
            before={{ label: 'Before', partitionBytes: stage0Bytes }}
            after={{ label: 'After', partitionBytes: deriveAfterPartitionBytes(stage0Bytes, after.plan.rewrites) }}
          />

          <TimelinePane run={after} currentMs={clock.t} domainMs={domainMs} />

          <MetricRibbon mode="single" values={toMetricValues(after)} metrics={AQE_METRICS} />
          <RunWarnings warnings={after.warnings} />
        </>
      )}

      <CodePane diff={diffText} config={configText} explain={EXPLAIN_PLACEHOLDER} />
    </article>
  );
}
