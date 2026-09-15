/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.getState().setKnobs(KNOB_DEFAULTS);
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
});
