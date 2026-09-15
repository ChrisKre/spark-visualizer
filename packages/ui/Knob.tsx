'use client';

// SAS-051 (E6) / DESIGN_SYSTEM.md §5 — "labelled <input type="range">, value shown in
// monospace, config key shown verbatim". ARCHITECTURE.md §8: real range input, keyboard-
// operable, visible focus ring. Presentational only, same as Scrubber — no store, no
// @sas/sim import.
import { useId, type JSX } from 'react';
import styles from './Knob.module.css';

export interface KnobProps {
  label: string;
  /** The underlying config name/meaning, shown verbatim — e.g. "spark.sql.shuffle.partitions". */
  configKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

export function Knob(props: KnobProps): JSX.Element {
  const { label, configKey, value, min, max, step, onChange, formatValue } = props;
  const id = useId();

  return (
    <div className={styles.knob}>
      <div className={styles.header}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <span className={styles.configKey}>{configKey}</span>
      </div>
      <div className={styles.control}>
        <input
          id={id}
          type="range"
          className={styles.range}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output htmlFor={id} className={`${styles.value} tabular-nums`}>
          {formatValue ? formatValue(value) : value}
        </output>
      </div>
    </div>
  );
}
