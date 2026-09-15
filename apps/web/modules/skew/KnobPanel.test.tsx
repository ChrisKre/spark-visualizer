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
  it('renders the four primary knobs, with sp only inside the Advanced disclosure', () => {
    render(<KnobPanel />);
    expect(screen.getByText('Skew (α)')).toBeInTheDocument();
    expect(screen.getByText('Salt factor')).toBeInTheDocument();
    expect(screen.getByText('Null keys')).toBeInTheDocument();
    expect(screen.getByText('Executors')).toBeInTheDocument();
    expect(screen.getByText('Shuffle partitions')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Advanced knobs' })).toBeInTheDocument();
  });

  it('dragging a knob updates the store', () => {
    render(<KnobPanel />);
    const slider = screen.getByRole('slider', { name: 'Salt factor' });
    fireEvent.change(slider, { target: { value: '8' } });
    expect(useAppStore.getState().knobs.salt).toBe(8);
  });

  it('the Advanced disclosure is collapsed by default and expands on click', async () => {
    const user = userEvent.setup();
    render(<KnobPanel />);
    const details = screen.getByRole('group', { name: 'Advanced knobs' }) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(screen.getByText('Advanced'));
    expect(details.open).toBe(true);
  });

  it('tracks knob_first_touched once, on whichever knob is dragged first', () => {
    render(<KnobPanel />);
    fireEvent.change(screen.getByRole('slider', { name: 'Salt factor' }), { target: { value: '8' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Executors' }), { target: { value: '4' } });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('knob_first_touched', { module: 'skew', knob: 'salt' });
  });
});
