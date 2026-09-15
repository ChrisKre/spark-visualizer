/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';

const track = vi.fn();
vi.mock('../../analytics/track', () => ({ track: (...args: unknown[]) => track(...args) }));

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.getState().setKnobs(KNOB_DEFAULTS);
  track.mockClear();
});

afterEach(cleanup);

describe('KnobPanel', () => {
  it('renders the aqe toggle checked by default, plus the three range knobs', () => {
    render(<KnobPanel />);
    expect(screen.getByRole('checkbox', { name: /Adaptive Query Execution/ })).toBeChecked();
    expect(screen.getByRole('slider', { name: 'Advisory partition size' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Skew factor' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Stats estimate error' })).toBeInTheDocument();
  });

  it('labels the est knob as not a real Spark config', () => {
    render(<KnobPanel />);
    expect(screen.getAllByText(/not a real Spark config/i).length).toBeGreaterThan(0);
  });

  it('toggling the checkbox flips the aqe knob between 1 and 0', async () => {
    const user = userEvent.setup();
    render(<KnobPanel />);

    await user.click(screen.getByRole('checkbox', { name: /Adaptive Query Execution/ }));
    expect(useAppStore.getState().knobs.aqe).toBe(0);

    await user.click(screen.getByRole('checkbox', { name: /Adaptive Query Execution/ }));
    expect(useAppStore.getState().knobs.aqe).toBe(1);
  });

  it('shows the est knob formatted as a multiplier, not a raw exponent', () => {
    render(<KnobPanel />);
    expect(screen.getByText('×100')).toBeInTheDocument();
  });

  it('tracks knob_first_touched once, on whichever knob is dragged first', () => {
    render(<KnobPanel />);
    fireEvent.change(screen.getByRole('slider', { name: 'Skew factor' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Advisory partition size' }), { target: { value: '32' } });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('knob_first_touched', { module: 'aqe', knob: 'skf' });
  });
});
