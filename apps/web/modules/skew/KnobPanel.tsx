'use client';

// SAS-051 (E6) — the four primary knobs plus `sp` behind a disclosure, per
// docs/modules/m1-skew.md §3: "sp is exposed as an advanced knob behind a disclosure, so the
// primary control set stays at four."
import { Knob } from '@sas/ui';
import { useRef, type JSX } from 'react';
import { track } from '../../analytics/track';
import { useAppActions, useKnobs } from '../../store/useAppStore';
import { ADVANCED_KNOB_DEFS, KNOB_DEFS, type KnobDef } from './knobs';
import styles from './KnobPanel.module.css';

function formatFor(def: KnobDef): ((value: number) => string) | undefined {
  return def.id === 'nulls' ? (value: number) => `${(value * 100).toFixed(0)}%` : undefined;
}

export function KnobPanel(): JSX.Element {
  const knobs = useKnobs();
  const { setKnob } = useAppActions();
  // SAS-077 — "knob first-touched" fires once per module mount, on whichever knob the user
  // touches first, not once per knob.
  const firstTouch = useRef(false);

  function renderKnob(def: KnobDef) {
    return (
      <Knob
        key={def.id}
        label={def.label}
        configKey={def.configKey}
        min={def.min}
        max={def.max}
        step={def.step}
        value={knobs[def.id] ?? def.default}
        onChange={(value) => {
          if (!firstTouch.current) {
            firstTouch.current = true;
            track('knob_first_touched', { module: 'skew', knob: def.id });
          }
          setKnob(def.id, value);
        }}
        formatValue={formatFor(def)}
      />
    );
  }

  return (
    <div className={styles.panel}>
      {KNOB_DEFS.map(renderKnob)}
      <details className={styles.advanced} aria-label="Advanced knobs">
        <summary>Advanced</summary>
        <div className={styles.advancedKnobs}>{ADVANCED_KNOB_DEFS.map(renderKnob)}</div>
      </details>
    </div>
  );
}
