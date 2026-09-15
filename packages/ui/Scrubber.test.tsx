/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scrubber } from './Scrubber';

afterEach(cleanup);

function baseProps() {
  return {
    t: 5_000,
    duration: 10_000,
    playing: false,
    speed: 1,
    onPlayPause: vi.fn(),
    onStep: vi.fn(),
    onScrub: vi.fn(),
    onSpeedChange: vi.fn(),
  };
}

describe('Scrubber', () => {
  it('labels the play button by current playing state', () => {
    const { rerender } = render(<Scrubber {...baseProps()} playing={false} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    rerender(<Scrubber {...baseProps()} playing />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('calls onPlayPause, onStep and onSpeedChange from their controls', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<Scrubber {...props} />);

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(props.onPlayPause).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Step forward' }));
    expect(props.onStep).toHaveBeenCalledWith(100); // default stepMs = 1% of 10_000

    await user.click(screen.getByRole('button', { name: 'Step back' }));
    expect(props.onStep).toHaveBeenCalledWith(-100);

    await user.click(screen.getByRole('button', { name: '2×' }));
    expect(props.onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('disables step back at t=0 and step forward at t=duration', () => {
    render(<Scrubber {...baseProps()} t={0} />);
    expect(screen.getByRole('button', { name: 'Step back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Step forward' })).not.toBeDisabled();

    cleanup();
    render(<Scrubber {...baseProps()} t={10_000} />);
    expect(screen.getByRole('button', { name: 'Step forward' })).toBeDisabled();
  });

  it('the range input reflects t/duration and calls onScrub on change', () => {
    const props = baseProps();
    render(<Scrubber {...props} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('10000');
    expect(slider.value).toBe('5000');
  });

  it('marks the active speed with aria-pressed', () => {
    render(<Scrubber {...baseProps()} speed={4} />);
    expect(screen.getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
  });
});
