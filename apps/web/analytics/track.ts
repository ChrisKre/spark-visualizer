'use client';

// SAS-077 (E8) — docs/APP_STATE.md §6: "Plausible or equivalent, cookieless, no PII. Track
// only: module opened, knob first-touched, comparison toggled, permalink copied, challenge
// completed." Challenge mode is v2.0 (E11) — its event isn't wired here yet.
//
// `window.plausible` is only defined once app/layout.tsx's conditional script tag has loaded
// (itself gated on `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` being set) — every call below is a no-op
// until then, so local dev and any deploy without that env var stays silent rather than
// erroring or queuing events.
export type AnalyticsEvent = 'module_opened' | 'knob_first_touched' | 'comparison_toggled' | 'permalink_copied';

export type AnalyticsProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: AnalyticsProps }) => void;
  }
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === 'undefined') return;
  window.plausible?.(event, props ? { props } : undefined);
}
