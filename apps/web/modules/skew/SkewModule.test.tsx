/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { SkewModule } from './SkewModule';
import { KNOB_DEFAULTS } from './knobs';

// jsdom doesn't implement matchMedia; ClockDriver's usePrefersReducedMotion needs one — see
// packages/viz/svg/PlanTree.test.tsx for the same stub.
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
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
});
