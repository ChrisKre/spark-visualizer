/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanTree } from './PlanTree';
import type { PlanTreeNode } from './planLayout';
import type { PlanRewrite } from './planRewrites';

// jsdom doesn't implement matchMedia at all; usePrefersReducedMotion needs one. Default to
// "no preference" here — the one test that cares about the reduced-motion branch overrides it.
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  stubMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Single-node trees keep the per-test circle counts trivially predictable.
const INITIAL: PlanTreeNode = { id: 2, kind: 'Exchange', stageId: 1, partitionCount: 200, children: [] };
const AFTER_COALESCE: PlanTreeNode = { id: 3, kind: 'Exchange', stageId: 1, partitionCount: 17, children: [] };
const FINAL: PlanTreeNode = AFTER_COALESCE;

const REWRITE: PlanRewrite = {
  rule: 'coalesceShufflePartitions',
  atMs: 1000,
  producingStageId: 1,
  description: 'coalesced 200 -> 17 partitions',
  before: INITIAL,
  after: AFTER_COALESCE,
};

describe('PlanTree', () => {
  it('renders the final plan statically when no currentMs is given', () => {
    render(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} />);
    expect(screen.getByText('Exchange')).toBeInTheDocument();
    expect(screen.queryByText(/AQE:/)).not.toBeInTheDocument();
  });

  it('renders the initial plan before any rewrite has fired', () => {
    render(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={500} />);
    expect(screen.queryByText(/AQE:/)).not.toBeInTheDocument();
  });

  it('renders the rewrite annotation — rule and verbatim description — once it has fired', () => {
    render(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={1000} />);
    // Exact match: the ChartFrame <title> also mentions the rule as part of a longer sentence
    // ("Query plan after AQE: ..."), so an exact string here targets only the annotation text.
    expect(screen.getByText('AQE: coalesce shuffle partitions')).toBeInTheDocument();
    expect(screen.getByText('coalesced 200 -> 17 partitions')).toBeInTheDocument();
  });

  it('stays on the same rewritten plan for any currentMs after it fires', () => {
    render(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={999_999} />);
    expect(screen.getByText('coalesced 200 -> 17 partitions')).toBeInTheDocument();
  });

  it('skips the transition — and its extra fading-out node — under prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const { container, rerender } = render(
      <PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={500} />,
    );
    rerender(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={1000} />);
    // No cross-fade means no second (outgoing) tree ever mounts — just the one steady tree.
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('briefly cross-fades outgoing and incoming nodes when a rewrite fires, then settles', () => {
    vi.useFakeTimers();
    const { rerender, container } = render(
      <PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={500} />,
    );
    act(() => {
      rerender(<PlanTree initial={INITIAL} final={FINAL} rewrites={[REWRITE]} currentMs={1000} />);
    });
    // Both the outgoing (fading) and incoming trees are present momentarily.
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(1);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Settled: only the incoming (now steady) tree remains.
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    vi.useRealTimers();
  });
});
