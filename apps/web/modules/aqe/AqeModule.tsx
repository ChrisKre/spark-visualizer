'use client';

// SAS-060/061/062 (E7) — scaffold, knobs, and the plan tree wired to a live run. Compare mode
// (frozen-left / live-right) and the partition strip land in SAS-063/064.
import { Scrubber } from '@sas/ui';
import { Badge, PlanTree } from '@sas/viz';
import { asSimMs } from '@sas/sim';
import { useEffect, type JSX } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions, useClock } from '../../store/useAppStore';
import { SETUP, TITLE } from './copy';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';
import { useAqeRun } from './useAqeRun';
import styles from './AqeModule.module.css';

export function AqeModule(): JSX.Element {
  const { setModule, play, pause, setSpeed, step, setT } = useAppActions();
  const clock = useClock();

  useEffect(() => {
    setModule('aqe', KNOB_DEFAULTS);
  }, [setModule]);

  const { after } = useAqeRun();

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
    </article>
  );
}
