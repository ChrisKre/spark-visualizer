'use client';

// SAS-061 (E7) — the three range knobs (adv, skf, est) plus the aqe on/off toggle, per
// docs/modules/m2-aqe.md §3. `aqe` is a checkbox, not a range `Knob` — a strictly binary
// control is a more honest affordance than a 0/1 slider (the same choice SkewModule.tsx
// already made for its own Compare toggle). `est` gets a log-scale `formatValue` and a visible
// caption naming it a stand-in for stale table statistics, not a real Spark config — the
// module doc's own acceptance criterion.
import { Knob } from '@sas/ui';
import { useId, useRef, type JSX } from 'react';
import { track } from '../../analytics/track';
import { useAppActions, useKnobs } from '../../store/useAppStore';
import { AQE_TOGGLE, KNOB_DEFS, type KnobDef } from './knobs';
import styles from './KnobPanel.module.css';

function formatFor(def: KnobDef): ((value: number) => string) | undefined {
  if (def.id === 'adv') return (value) => `${value} MiB`;
  if (def.id === 'est') return (value) => `×${value < 0 ? (10 ** value).toFixed(3) : 10 ** value}`;
  return undefined;
}

export function KnobPanel(): JSX.Element {
  const knobs = useKnobs();
  const { setKnob } = useAppActions();
  const aqeToggleId = useId();
  // SAS-077 — "knob first-touched" fires once per module mount, on whichever knob the user
  // touches first, not once per knob.
  const firstTouch = useRef(false);

  function renderKnob(def: KnobDef) {
    return (
      <div key={def.id} className={styles.knobWithNote}>
        <Knob
          label={def.label}
          configKey={def.configKey}
          min={def.min}
          max={def.max}
          step={def.step}
          value={knobs[def.id] ?? def.default}
          onChange={(value) => {
            if (!firstTouch.current) {
              firstTouch.current = true;
              track('knob_first_touched', { module: 'aqe', knob: def.id });
            }
            setKnob(def.id, value);
          }}
          formatValue={formatFor(def)}
        />
        {def.id === 'est' ? (
          <p className={styles.note}>Not a real Spark config — a stand-in for stale or missing table statistics.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <label className={styles.toggle} htmlFor={aqeToggleId}>
        <input
          id={aqeToggleId}
          type="checkbox"
          checked={(knobs[AQE_TOGGLE.id] ?? AQE_TOGGLE.default) === 1}
          onChange={(event) => setKnob(AQE_TOGGLE.id, event.target.checked ? 1 : 0)}
        />
        {AQE_TOGGLE.label}
        <span className={styles.configKey}>{AQE_TOGGLE.configKey}</span>
      </label>
      {KNOB_DEFS.map(renderKnob)}
    </div>
  );
}
