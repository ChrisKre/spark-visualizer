/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext() as unknown as CanvasRenderingContext2D);
  useAppStore.setState(useAppStore.getInitialState(), true);
  window.history.replaceState(null, '', '/m/skew');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
});
