/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { AqeModule } from './AqeModule';
import { KNOB_DEFAULTS } from './knobs';

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
});

afterEach(cleanup);

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
});
