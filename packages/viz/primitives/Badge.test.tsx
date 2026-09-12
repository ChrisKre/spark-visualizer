/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './Badge';

afterEach(cleanup);

describe('Badge', () => {
  it.each([
    ['measured', 'MEASURED'],
    ['modeled', 'MODELED'],
    ['executed', 'EXECUTED'],
  ] as const)('renders %s provenance as %s', (provenance, expected) => {
    render(<Badge provenance={provenance} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('has no prop that can override the label independent of provenance', () => {
    // @ts-expect-error — BadgeProps declares only `provenance`; a caller cannot pass a
    // competing `label` to make the badge lie about what produced the result (ADR-0003).
    render(<Badge provenance="modeled" label="MEASURED" />);
    // Even though TS already rejects this at compile time, prove the runtime behavior too:
    // the bogus `label` prop is simply not read, so provenance alone still wins.
    expect(screen.getByText('MODELED')).toBeInTheDocument();
    expect(screen.queryByText('MEASURED')).not.toBeInTheDocument();
  });
});
