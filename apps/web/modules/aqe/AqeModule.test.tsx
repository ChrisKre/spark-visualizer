/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AqeModule } from './AqeModule';

afterEach(cleanup);

describe('AqeModule (scaffold)', () => {
  it('renders the title and setup copy', () => {
    render(<AqeModule />);
    expect(screen.getByRole('heading', { name: 'Adaptive Query Execution' })).toBeInTheDocument();
    expect(screen.getByText(/the optimiser guessed wrong at planning time/)).toBeInTheDocument();
  });
});
