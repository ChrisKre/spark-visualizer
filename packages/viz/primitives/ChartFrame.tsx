// The responsive-viewBox wrapper every SVG chart in packages/viz builds on. Scaling is pure
// CSS/SVG (`viewBox` + `width: 100%`) — no ResizeObserver or JS width measurement needed,
// unlike the Canvas components in packages/viz/canvas, which genuinely need pixel dimensions.
//
// The wrapping div is the chart's own horizontal-scroll boundary (DESIGN_SYSTEM.md §4: "charts
// wider than the column get their own overflow-x: auto — page body never scrolls sideways",
// already enforced globally via `overflow-x: hidden` on html/body in apps/web/app/globals.css).
'use client';

import { useId, type JSX, type ReactNode } from 'react';
import styles from './ChartFrame.module.css';

export interface ChartFrameProps {
  viewBoxWidth: number;
  viewBoxHeight: number;
  /** Required — every chart names itself for screen readers via <title>. */
  title: string;
  /** Optional longer description, rendered as <desc>. */
  desc?: string;
  className?: string;
  children: ReactNode;
}

export function ChartFrame(props: ChartFrameProps): JSX.Element {
  const { viewBoxWidth, viewBoxHeight, title, desc, className, children } = props;
  const titleId = useId();
  const descId = useId();

  return (
    <div className={styles.scroll}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        width="100%"
        preserveAspectRatio="xMinYMid meet"
        role="img"
        aria-labelledby={desc ? `${titleId} ${descId}` : titleId}
        className={className}
      >
        <title id={titleId}>{title}</title>
        {desc ? <desc id={descId}>{desc}</desc> : null}
        {children}
      </svg>
    </div>
  );
}
