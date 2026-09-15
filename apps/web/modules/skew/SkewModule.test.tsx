/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { simulate } from '@sas/sim';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { resetMeasuredFixturesCache } from '../../fixtures/loadMeasuredFixtures';
import { buildRunConfig } from './buildRunConfig';
import { SkewModule } from './SkewModule';
import { KNOB_DEFAULTS } from './knobs';

// jsdom implements neither matchMedia, ResizeObserver, nor a real canvas 2D context — see
// packages/viz/svg/PlanTree.test.tsx and packages/viz/canvas/TaskTimeline.test.tsx for the
// same stubs, needed here now that SkewModule renders both a clock-aware component and
// TaskTimeline directly.
class NoopResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function mockCanvasContext() {
  return { canvas: { width: 0, height: 0 }, clearRect: vi.fn(), fillRect: vi.fn(), setTransform: vi.fn(), fillStyle: '' };
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  // No committed fixture is non-synthetic yet, so an always-404 fetch is the deterministic,
  // explicit stand-in for "the fixture index hasn't resolved to anything yet" — see
  // apps/web/fixtures/loadMeasuredFixtures.ts.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
  resetMeasuredFixturesCache();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext() as unknown as CanvasRenderingContext2D);
  useAppStore.setState(useAppStore.getInitialState(), true);
  window.history.replaceState(null, '', '/m/skew');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetMeasuredFixturesCache();
});

describe('SkewModule', () => {
  it('renders the title, setup copy and the knob panel', () => {
    render(<SkewModule />);
    expect(screen.getByRole('heading', { name: 'Data skew & salting' })).toBeInTheDocument();
    expect(screen.getByText(/Six months of NYC taxi trips/)).toBeInTheDocument();
    expect(screen.getByText('Skew (α)')).toBeInTheDocument();
  });

  it('registers itself with the store on mount, with the module knob defaults', () => {
    render(<SkewModule />);
    expect(useAppStore.getState().moduleId).toBe('skew');
    expect(useAppStore.getState().knobs).toEqual(KNOB_DEFAULTS);
  });

  it('runs the simulator and wires the result to the badge, ribbon and timeline', () => {
    render(<SkewModule />);

    expect(screen.getByText('MODELED')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Run metrics' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Task timeline' })).toBeInTheDocument();
    // The default knobs are skewed (a=1.6, salt=1) — the store's clock duration should have
    // picked up a real, positive wall clock from the run rather than staying at its initial 0.
    expect(useAppStore.getState().clock.duration).toBeGreaterThan(0);
  });

  it('renders a play/pause scrubber wired to the clock', () => {
    render(<SkewModule />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('toggling Compare switches to before/after panes, two timelines and a compare ribbon', async () => {
    const user = userEvent.setup();
    render(<SkewModule />);

    expect(screen.getAllByRole('img', { name: 'Task timeline' })).toHaveLength(1);

    await user.click(screen.getByRole('checkbox', { name: 'Compare before/after' }));

    expect(useAppStore.getState().compare).toBe(true);
    expect(screen.getAllByRole('img', { name: 'Task timeline' })).toHaveLength(2);
    // Appears in both the histogram (chart label + its visually-hidden data table, once per
    // row) and each timeline pane's own header — the exact count isn't the point, presence is.
    expect(screen.getAllByText('Before (salt 1)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('After').length).toBeGreaterThan(0);
    // MetricRibbon's compare mode renders before/after/delta per metric — MODELED badge
    // appears twice now (once per pane) instead of once.
    expect(screen.getAllByText('MODELED')).toHaveLength(2);
  });

  it('compare mode picks the longer (unsalted "before") run as the clock duration', async () => {
    const user = userEvent.setup();
    render(<SkewModule />);
    await user.click(screen.getByRole('checkbox', { name: 'Compare before/after' }));

    // Default knobs start at salt=1, so "before" and "after" coincide — salt the knob to
    // make them diverge, matching useSkewRun.test.ts's own compare-mode duration assertion.
    fireEvent.change(screen.getByRole('slider', { name: 'Salt factor' }), { target: { value: '8' } });

    const expectedBefore = simulate(buildRunConfig({ ...KNOB_DEFAULTS, salt: 1 }), 42).metrics.wallClockMs;
    const expectedAfter = simulate(buildRunConfig({ ...KNOB_DEFAULTS, salt: 8 }), 42).metrics.wallClockMs;
    // Salting always reduces wall clock in this scenario (buildRunConfig.test.ts asserts
    // this directly) — so the duration-setting side must be the unsalted "before", not
    // "after", and definitely not their sum or average.
    expect(expectedBefore).toBeGreaterThan(expectedAfter);
    expect(useAppStore.getState().clock.duration).toBe(expectedBefore);
  });

  it('the null-trap preset is reachable in one click and shows the filter-not-salt explanation', async () => {
    const user = userEvent.setup();
    render(<SkewModule />);

    expect(screen.queryByText(/the fix is a filter/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try: 3% null keys' }));

    expect(useAppStore.getState().knobs).toMatchObject({ a: 0, nulls: 0.03, salt: 1 });
    expect(screen.getByText(/the fix is a filter/)).toBeInTheDocument();
  });

  it('renders a code pane with Diff, Config and EXPLAIN tabs', async () => {
    const user = userEvent.setup();
    render(<SkewModule />);

    expect(screen.getByRole('tab', { name: 'Diff' })).toBeInTheDocument();
    expect(screen.getByText(/orders\.join\(zones/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Config' }));
    expect(screen.getByText(new RegExp(`saltFactor=${KNOB_DEFAULTS.salt}`))).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'EXPLAIN' }));
    expect(screen.getByText(/none is available yet/i)).toBeInTheDocument();
  });

  it('the Config tab diffs before vs after once compare mode is on', async () => {
    const user = userEvent.setup();
    render(<SkewModule />);

    await user.click(screen.getByRole('checkbox', { name: 'Compare before/after' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Salt factor' }), { target: { value: '8' } });
    await user.click(screen.getByRole('tab', { name: 'Config' }));

    expect(screen.getByText(/saltFactor=1/)).toBeInTheDocument();
    expect(screen.getByText(/saltFactor=8/)).toBeInTheDocument();
  });
});
