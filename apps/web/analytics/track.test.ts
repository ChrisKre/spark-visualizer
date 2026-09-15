/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from './track';

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { plausible?: unknown }).plausible;
});

describe('track', () => {
  it('is a silent no-op when window.plausible is not defined', () => {
    expect(() => track('module_opened', { module: 'skew' })).not.toThrow();
  });

  it('forwards the event name and props to window.plausible', () => {
    const plausible = vi.fn();
    window.plausible = plausible;

    track('knob_first_touched', { module: 'aqe', knob: 'skf' });

    expect(plausible).toHaveBeenCalledWith('knob_first_touched', { props: { module: 'aqe', knob: 'skf' } });
  });

  it('omits the options object entirely when no props are given', () => {
    const plausible = vi.fn();
    window.plausible = plausible;

    track('permalink_copied');

    expect(plausible).toHaveBeenCalledWith('permalink_copied', undefined);
  });
});
