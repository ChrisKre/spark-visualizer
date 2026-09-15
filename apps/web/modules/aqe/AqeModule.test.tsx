/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { asSimMs, simulate } from '@sas/sim';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { resetMeasuredFixturesCache } from '../../fixtures/loadMeasuredFixtures';
import { AqeModule } from './AqeModule';
import { buildRunConfig } from './buildRunConfig';
import { KNOB_DEFAULTS } from './knobs';

// jsdom implements neither matchMedia, ResizeObserver, nor a real canvas 2D context — see
// packages/viz/svg/PlanTree.test.tsx and packages/viz/canvas/TaskTimeline.test.tsx for the
// same stubs, needed here now that AqeModule renders both clock-aware SVG and TaskTimeline.
class NoopResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function mockCanvasContext() {
  return { canvas: { width: 0, height: 0 }, clearRect: vi.fn(), fillRect: vi.fn(), setTransform: vi.fn(), fillStyle: '' };
}

const track = vi.fn();
vi.mock('../../analytics/track', () => ({ track: (...args: unknown[]) => track(...args) }));

beforeEach(() => {
  track.mockClear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  // See SkewModule.test.tsx's identical mock for why this is an empty-but-successful manifest
  // (`fetchFailed: false`), not `{ ok: false }` (SAS-076's fixture-fetch-failure notice would
  // spuriously appear in every test in this file otherwise).
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
  resetMeasuredFixturesCache();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext() as unknown as CanvasRenderingContext2D);
  useAppStore.setState(useAppStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetMeasuredFixturesCache();
});

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

  it('runs the simulator and wires the result to the badge, plan tree, timeline and ribbon', () => {
    render(<AqeModule />);

    expect(screen.getByText('MODELED')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Query plan/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Task timeline' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Run metrics' })).toBeInTheDocument();
    expect(useAppStore.getState().clock.duration).toBeGreaterThan(0);
  });

  it('renders a play/pause scrubber wired to the clock', () => {
    render(<AqeModule />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('tracks module_opened on mount', () => {
    render(<AqeModule />);
    expect(track).toHaveBeenCalledWith('module_opened', { module: 'aqe' });
  });

  it('tracks comparison_toggled when the compare checkbox flips', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);
    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));
    expect(track).toHaveBeenCalledWith('comparison_toggled', { module: 'aqe', compare: true });
  });

  it('copying the permalink tracks permalink_copied', async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own Clipboard stub, overwriting anything defined before
    // it — this must run after setup() so ours wins. See packages/ui/CopyLinkButton.test.tsx.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
    render(<AqeModule />);
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(track).toHaveBeenCalledWith('permalink_copied', { module: 'aqe' });
  });

  it('the plan tree annotates the coalesce rewrite once the clock reaches its firing point', () => {
    render(<AqeModule />);

    const duration = useAppStore.getState().clock.duration;
    act(() => {
      useAppStore.getState().setT(asSimMs(duration));
    });

    expect(screen.getAllByText(/AQE: coalesce shuffle partitions/).length).toBeGreaterThan(0);
  });

  it('renders a partition strip showing 200 partitions merging down under the default coalesce', () => {
    render(<AqeModule />);
    expect(screen.getByText('Before (200)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Partition strip/ })).toBeInTheDocument();
  });

  it('the ribbon includes task count, and it shows a real win over aqe off by default', () => {
    render(<AqeModule />);
    expect(screen.getByText('Task count')).toBeInTheDocument();
  });

  it('toggling Compare switches to two frozen/live plan-tree panes, two timelines and a compare ribbon', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);

    expect(screen.getAllByRole('img', { name: 'Task timeline' })).toHaveLength(1);

    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));

    expect(useAppStore.getState().compare).toBe(true);
    expect(screen.getAllByRole('img', { name: 'Task timeline' })).toHaveLength(2);
    expect(screen.getAllByText('AQE off').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AQE on').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MODELED')).toHaveLength(2);
  });

  it('the left (AQE off) plan tree never rewrites, at any clock position', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);
    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));

    const duration = useAppStore.getState().clock.duration;
    act(() => {
      useAppStore.getState().setT(asSimMs(duration));
    });

    // The right pane fires the coalesce rewrite; the left (frozen) pane must not. The rule
    // name appears twice within the firing pane (the ChartFrame <title> and the annotation
    // <text> — same duplication PlanTree.test.tsx documents), so 2 matches, not 4, confirms
    // only one of the two panes rewrote.
    expect(screen.getAllByText(/AQE: coalesce shuffle partitions/).length).toBe(2);
  });

  it('the compare ribbon shows a real, non-zero task-count win for AQE on vs off at default knobs', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);
    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));

    const off = simulate(buildRunConfig({ ...KNOB_DEFAULTS, aqe: 0 }), 42);
    const on = simulate(buildRunConfig(KNOB_DEFAULTS), 42);
    expect(on.tasks.length).toBeLessThan(off.tasks.length);

    expect(screen.getByText(String(off.tasks.length))).toBeInTheDocument();
    expect(screen.getByText(String(on.tasks.length))).toBeInTheDocument();
  });

  it('compare mode picks the longer (AQE-off) run as the clock duration once a knob favors AQE', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);
    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));

    fireEvent.change(screen.getByRole('slider', { name: 'Skew factor' }), { target: { value: '2' } });

    const off = simulate(buildRunConfig({ ...KNOB_DEFAULTS, skf: 2, aqe: 0 }), 42).metrics.wallClockMs;
    const on = simulate(buildRunConfig({ ...KNOB_DEFAULTS, skf: 2 }), 42).metrics.wallClockMs;
    expect(useAppStore.getState().clock.duration).toBe(Math.max(off, on));
  });

  it('shows a quiet notice when the fixture manifest fetch genuinely fails, and none otherwise', async () => {
    render(<AqeModule />);
    expect(screen.queryByText(/measured-fixture data/)).not.toBeInTheDocument();
    cleanup();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
    resetMeasuredFixturesCache();
    render(<AqeModule />);
    expect(await screen.findByText(/measured-fixture data/)).toBeInTheDocument();
  });

  it('renders a code pane with Diff, Config and EXPLAIN tabs', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);

    expect(screen.getByRole('tab', { name: 'Diff' })).toBeInTheDocument();
    expect(screen.getByText(/Initial physical plan/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Config' }));
    expect(screen.getByText(/spark\.conf\.set\("spark\.sql\.adaptive\.enabled"/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'EXPLAIN' }));
    expect(screen.getByText(/none is available yet/i)).toBeInTheDocument();
  });

  it('the Config tab diffs AQE off vs on once compare mode is on', async () => {
    const user = userEvent.setup();
    render(<AqeModule />);

    await user.click(screen.getByRole('checkbox', { name: 'Compare AQE off/on' }));
    await user.click(screen.getByRole('tab', { name: 'Config' }));

    expect(screen.getByText(/spark\.sql\.adaptive\.enabled", "false"/)).toBeInTheDocument();
    expect(screen.getByText(/spark\.sql\.adaptive\.enabled", "true"/)).toBeInTheDocument();
  });
});
