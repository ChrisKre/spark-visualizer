'use client';

// SAS-052 (E6) — the histogram, timeline and ribbon wired to a live run. All three read the
// same `clock.t` (ARCHITECTURE.md §4's "one clock"); the Scrubber is what moves it.
import { Scrubber } from '@sas/ui';
import { Badge, MetricRibbon, PartitionHistogram, TaskTimeline } from '@sas/viz';
import { asSimMs } from '@sas/sim';
import { useEffect } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions, useClock, useKnobs } from '../../store/useAppStore';
import { useUrlSync } from '../../store/urlSync';
import { SETUP, TITLE } from './copy';
import { pickHistogramStage } from './histogramStage';
import { KnobPanel } from './KnobPanel';
import { defaultFor, KNOB_DEFAULTS } from './knobs';
import { toMetricValues } from './toMetricValues';
import { toTimelineTasks } from './toTimelineTasks';
import { useSkewRun } from './useSkewRun';
import styles from './SkewModule.module.css';

export function SkewModule() {
  const { setModule, play, pause, setSpeed, step, setT } = useAppActions();
  const clock = useClock();
  const knobs = useKnobs();

  useEffect(() => {
    setModule('skew', KNOB_DEFAULTS);
  }, [setModule]);

  useUrlSync(KNOB_DEFAULTS);

  const result = useSkewRun();
  const shufflePartitions = knobs.sp ?? defaultFor('sp');
  const histogramStage = pickHistogramStage(result, shufflePartitions);

  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />

      <div className={styles.runHeader}>
        <Badge provenance={result.provenance} />
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

      {histogramStage ? (
        <PartitionHistogram panes={[{ label: 'Partitions', partitionBytes: histogramStage.partitionBytes }]} />
      ) : null}

      <TaskTimeline
        tasks={toTimelineTasks(result.tasks)}
        currentMs={clock.t}
        domainMs={[0, Math.max(1, result.metrics.wallClockMs)]}
      />

      <MetricRibbon mode="single" values={toMetricValues(result.metrics)} />
    </article>
  );
}
