'use client';

// SAS-073 (E8) — play/pause/step/speed (DESIGN_SYSTEM.md §5). Purely presentational: no
// store, no clock, no @sas/sim import (packages/ui sits at the base of the dependency graph
// and may not depend on packages/sim — see .dependency-cruiser.cjs), so `t`/`duration` are
// plain numbers of simulated ms and every control is a callback prop. apps/web's ClockDriver
// slice owns the actual state this wires to.
import { useId, type JSX } from 'react';
import { formatDuration } from './format';
import styles from './Scrubber.module.css';

export interface ScrubberProps {
  t: number;
  duration: number;
  playing: boolean;
  speed: number;
  onPlayPause: () => void;
  onStep: (deltaMs: number) => void;
  onScrub: (t: number) => void;
  onSpeedChange: (speed: number) => void;
  /** One step-button press, in simulated ms. Defaults to 1% of duration. */
  stepMs?: number;
  speeds?: number[];
}

const DEFAULT_SPEEDS = [0.5, 1, 2, 4];

export function Scrubber(props: ScrubberProps): JSX.Element {
  const {
    t,
    duration,
    playing,
    speed,
    onPlayPause,
    onStep,
    onScrub,
    onSpeedChange,
    stepMs,
    speeds = DEFAULT_SPEEDS,
  } = props;
  const sliderId = useId();
  const step = stepMs ?? Math.max(1, Math.round(duration / 100));

  return (
    <div className={styles.scrubber}>
      <button type="button" className={styles.button} onClick={onPlayPause} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => onStep(-step)}
        aria-label="Step back"
        disabled={t <= 0}
      >
        ⏮
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => onStep(step)}
        aria-label="Step forward"
        disabled={t >= duration}
      >
        ⏭
      </button>
      <label htmlFor={sliderId} className={styles.srOnly}>
        Timeline position
      </label>
      <input
        id={sliderId}
        type="range"
        className={styles.slider}
        min={0}
        max={Math.max(duration, 0)}
        value={Math.min(Math.max(t, 0), Math.max(duration, 0))}
        onChange={(event) => onScrub(Number(event.target.value))}
      />
      <span className={`${styles.time} tabular-nums`}>
        {formatDuration(t)} / {formatDuration(duration)}
      </span>
      <div className={styles.speeds} role="group" aria-label="Playback speed">
        {speeds.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.button} ${option === speed ? styles.speedActive : ''}`}
            onClick={() => onSpeedChange(option)}
            aria-pressed={option === speed}
          >
            {option}×
          </button>
        ))}
      </div>
    </div>
  );
}
