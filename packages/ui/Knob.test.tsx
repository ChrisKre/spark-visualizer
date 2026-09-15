/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Knob } from './Knob';

afterEach(cleanup);

describe('Knob', () => {
  it('shows the label, the config key verbatim, and the current value', () => {
    render(<Knob label="Skew (α)" configKey="zipfAlpha" value={1.6} min={0} max={2.2} step={0.1} onChange={vi.fn()} />);
    expect(screen.getByText('Skew (α)')).toBeInTheDocument();
    expect(screen.getByText('zipfAlpha')).toBeInTheDocument();
    expect(screen.getByText('1.6')).toBeInTheDocument();
  });

  it('the range input is labelled and reflects min/max/step/value', () => {
    render(<Knob label="Executors" configKey="spark.executor.instances" value={8} min={2} max={32} step={1} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Executors' }) as HTMLInputElement;
    expect(slider.min).toBe('2');
    expect(slider.max).toBe('32');
    expect(slider.step).toBe('1');
    expect(slider.value).toBe('8');
  });

  it('calls onChange with the numeric value on drag', () => {
    const onChange = vi.fn();
    render(<Knob label="Executors" configKey="spark.executor.instances" value={8} min={2} max={32} step={1} onChange={onChange} />);
    const slider = screen.getByRole('slider', { name: 'Executors' });
    fireEvent.change(slider, { target: { value: '9' } });
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it('formatValue overrides the raw number display', () => {
    render(
      <Knob
        label="Null keys"
        configKey="nullFraction"
        value={0.03}
        min={0}
        max={0.15}
        step={0.01}
        onChange={vi.fn()}
        formatValue={(v) => `${(v * 100).toFixed(0)}%`}
      />,
    );
    expect(screen.getByText('3%')).toBeInTheDocument();
  });
});
