/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunWarnings } from './RunWarnings';
import styles from './RunWarnings.module.css';

afterEach(cleanup);

describe('RunWarnings', () => {
  it('renders nothing for an empty warnings array', () => {
    const { container } = render(<RunWarnings warnings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each warning message', () => {
    render(
      <RunWarnings
        warnings={[
          { code: 'oom', message: 'Stage 2 failed: a task exceeded the OOM threshold.' },
          { code: 'high-spill', message: 'A significant fraction of shuffle data spilled to disk.' },
        ]}
      />,
    );
    expect(screen.getByText('Stage 2 failed: a task exceeded the OOM threshold.')).toBeInTheDocument();
    expect(screen.getByText('A significant fraction of shuffle data spilled to disk.')).toBeInTheDocument();
  });

  it('styles oom as critical and every other code as a non-fatal warning', () => {
    const { container } = render(
      <RunWarnings
        warnings={[
          { code: 'oom', message: 'oom' },
          { code: 'excessive-gc', message: 'gc' },
          { code: 'idle-reducers', message: 'idle' },
          { code: 'high-spill', message: 'spill' },
        ]}
      />,
    );
    const items = Array.from(container.querySelectorAll(`.${styles.warning}`));
    expect(items).toHaveLength(4);
    expect(container.querySelectorAll(`.${styles.crit}`)).toHaveLength(1);
    expect(container.querySelectorAll(`.${styles.warn}`)).toHaveLength(3);
  });

  it('shows an optional label above the list', () => {
    render(<RunWarnings warnings={[{ code: 'oom', message: 'oom' }]} label="Before" />);
    expect(screen.getByText('Before')).toBeInTheDocument();
  });
});
