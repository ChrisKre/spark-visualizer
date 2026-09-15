'use client';

// SAS-052/053 (E6) — the histogram, timeline and ribbon wired to a live run, with a
// before/after compare mode. All panes read the same `clock.t` (ARCHITECTURE.md §4's "one
// clock"); the Scrubber is what moves it, and PartitionHistogram/MetricRibbon's own compare
// props are what keep before/after sharing one scale rather than two independent ones.
import { Scrubber } from '@sas/ui';
import { Badge, MetricRibbon, PartitionHistogram, TaskTimeline } from '@sas/viz';
import { asSimMs, type RunResult } from '@sas/sim';
import { useEffect, useId, type JSX } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions, useClock, useCompare, useKnobs } from '../../store/useAppStore';
import { useUrlSync } from '../../store/urlSync';
import { NULL_TRAP_EXPLANATION, NULL_TRAP_PRESET_LABEL, SETUP, TITLE } from './copy';
import { pickHistogramStage } from './histogramStage';
import { KnobPanel } from './KnobPanel';
import { defaultFor, KNOB_DEFAULTS } from './knobs';
import { isNullTrapActive, NULL_TRAP_PRESET_KNOBS } from './nullTrapPreset';
import { toMetricValues } from './toMetricValues';
import { toTimelineTasks } from './toTimelineTasks';
import { useSkewRun } from './useSkewRun';
import styles from './SkewModule.module.css';

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

export function SkewModule() {
  const { setModule, play, pause, setSpeed, step, setT, setCompare, setKnobs } = useAppActions();
  const clock = useClock();
  const knobs = useKnobs();
  const compare = useCompare();
  const compareToggleId = useId();

  useEffect(() => {
    setModule('skew', KNOB_DEFAULTS);
  }, [setModule]);

  useUrlSync(KNOB_DEFAULTS);

  const { after, before } = useSkewRun();
  const shufflePartitions = knobs.sp ?? defaultFor('sp');
  const domainMs: [number, number] = [0, Math.max(1, clock.duration)];

  const afterHistogramStage = pickHistogramStage(after, shufflePartitions);
  const beforeHistogramStage = before ? pickHistogramStage(before, shufflePartitions) : undefined;

  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />

      <div className={styles.presets}>
        <button type="button" className={styles.presetButton} onClick={() => setKnobs({ ...knobs, ...NULL_TRAP_PRESET_KNOBS })}>
          {NULL_TRAP_PRESET_LABEL}
        </button>
      </div>
      {isNullTrapActive(knobs) ? <p className={styles.nullTrapCallout}>{NULL_TRAP_EXPLANATION}</p> : null}

      <div className={styles.runHeader}>
        <label className={styles.compareToggle} htmlFor={compareToggleId}>
          <input
            id={compareToggleId}
            type="checkbox"
            checked={compare}
            onChange={(event) => setCompare(event.target.checked)}
          />
          Compare before/after
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

      {before && beforeHistogramStage && afterHistogramStage ? (
        <>
          <PartitionHistogram
            panes={[
              { label: 'Before (salt 1)', partitionBytes: beforeHistogramStage.partitionBytes },
              { label: 'After', partitionBytes: afterHistogramStage.partitionBytes },
            ]}
          />
          <div className={styles.timelines}>
            <TimelinePane label="Before (salt 1)" run={before} currentMs={clock.t} domainMs={domainMs} />
            <TimelinePane label="After" run={after} currentMs={clock.t} domainMs={domainMs} />
          </div>
          <MetricRibbon mode="compare" before={toMetricValues(before.metrics)} after={toMetricValues(after.metrics)} />
        </>
      ) : (
        <>
          {afterHistogramStage ? (
            <PartitionHistogram panes={[{ label: 'Partitions', partitionBytes: afterHistogramStage.partitionBytes }]} />
          ) : null}
          <TimelinePane run={after} currentMs={clock.t} domainMs={domainMs} />
          <MetricRibbon mode="single" values={toMetricValues(after.metrics)} />
        </>
      )}
    </article>
  );
}
