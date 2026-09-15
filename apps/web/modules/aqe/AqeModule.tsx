'use client';

// SAS-060/061/062/063 (E7) — scaffold, knobs, the plan tree wired to a live run, and the
// partition strip. Compare mode (frozen-left / live-right) lands in SAS-064.
import { Scrubber } from '@sas/ui';
import { Badge, PartitionStrip, PlanTree } from '@sas/viz';
import { asSimMs } from '@sas/sim';
import { useEffect, type JSX } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions, useClock } from '../../store/useAppStore';
import { SETUP, TITLE } from './copy';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';
import { deriveAfterPartitionBytes } from './partitionStripCells';
import { useAqeRun } from './useAqeRun';
import styles from './AqeModule.module.css';

export function AqeModule(): JSX.Element {
  const { setModule, play, pause, setSpeed, step, setT } = useAppActions();
  const clock = useClock();

  useEffect(() => {
    setModule('aqe', KNOB_DEFAULTS);
  }, [setModule]);

  const { after } = useAqeRun();
  const stage0Bytes = after.stages[0]?.partitionBytes ?? [];

  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />

      <div className={styles.runHeader}>
        <Badge provenance={after.provenance} />
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
    </article>
  );
}
