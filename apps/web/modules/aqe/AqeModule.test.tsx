/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { asSimMs } from '@sas/sim';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { resetMeasuredFixturesCache } from '../../fixtures/loadMeasuredFixtures';
import { AqeModule } from './AqeModule';
import { KNOB_DEFAULTS } from './knobs';

beforeEach(() => {
  // jsdom doesn't implement matchMedia — PlanTree's usePrefersReducedMotion needs one.
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
  resetMeasuredFixturesCache();
  useAppStore.setState(useAppStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetMeasuredFixturesCache();
});

describe('AqeModule', () => {
  it('renders the title, setup copy and the knob panel', () => {
    render(<AqeModule />);
    expect(screen.getByRole('heading', { name: 'Adaptive Query Execution' })).toBeInTheDocument();
    expect(screen.getByText(/the optimiser guessed wrong at planning time/)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Skew factor' })).toBeInTheDocument();
  });

  it('registers itself with the store on mount, with the module knob defaults', () => {
    render(<AqeModule />);
    expect(useAppStore.getState().moduleId).toBe('aqe');
    expect(useAppStore.getState().knobs).toEqual(KNOB_DEFAULTS);
  });

  it('runs the simulator and wires the result to the badge and plan tree', () => {
    render(<AqeModule />);

    expect(screen.getByText('MODELED')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Query plan/ })).toBeInTheDocument();
    // Default knobs fire exactly one rewrite (coalesce) — a real, positive wall clock.
    expect(useAppStore.getState().clock.duration).toBeGreaterThan(0);
  });

  it('renders a play/pause scrubber wired to the clock', () => {
    render(<AqeModule />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('the plan tree annotates the coalesce rewrite once the clock reaches its firing point', () => {
    render(<AqeModule />);

    const duration = useAppStore.getState().clock.duration;
    act(() => {
      useAppStore.getState().setT(asSimMs(duration));
    });

    expect(screen.getAllByText(/AQE: coalesce shuffle partitions/).length).toBeGreaterThan(0);
  });

  it('renders a partition strip showing 200 partitions merging down under the default coalesce', () => {
    render(<AqeModule />);
    expect(screen.getByText('Before (200)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Partition strip/ })).toBeInTheDocument();
  });
});
