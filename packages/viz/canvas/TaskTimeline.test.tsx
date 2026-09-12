/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskTimeline, type TimelineTask } from './TaskTimeline';

afterEach(cleanup);

// jsdom implements neither ResizeObserver nor a real canvas 2D context. A no-op observer
// keeps the component on its default {width:600, height:240} dimensions, and a hand-mocked
// context captures paint calls without needing a real compositor.
class NoopResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function mockCanvasContext() {
  return {
    canvas: { width: 0, height: 0 },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvasContext() as unknown as CanvasRenderingContext2D);
});

function makeTask(overrides: Partial<TimelineTask> = {}): TimelineTask {
  return {
    taskId: 1,
    stageId: 0,
    slot: 0,
    partitionId: 0,
    launchMs: 0,
    finishMs: 100,
    shuffleReadBytes: 2048,
    memorySpilledBytes: 0,
    diskSpilledBytes: 512,
    status: 'ok',
    ...overrides,
  };
}

describe('TaskTimeline', () => {
  it('renders a labelled canvas', () => {
    render(<TaskTimeline tasks={[makeTask()]} currentMs={100} />);
    expect(screen.getByRole('img', { name: 'Task timeline' })).toBeInTheDocument();
  });

  it('ships an accessible task list with one entry per task, carrying the same data', () => {
    const tasks = [
      makeTask({ taskId: 1, partitionId: 0 }),
      makeTask({ taskId: 2, partitionId: 1, slot: 1 }),
    ];
    render(<TaskTimeline tasks={tasks} currentMs={100} />);
    const list = screen.getByRole('list', { name: 'Task list' });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(screen.getByText(/Task 1.*partition 0/)).toBeInTheDocument();
    expect(screen.getByText(/Task 2.*partition 1/)).toBeInTheDocument();
  });

  it('moves focus between list buttons with arrow keys', async () => {
    const user = userEvent.setup();
    const tasks = [makeTask({ taskId: 1 }), makeTask({ taskId: 2, slot: 1 })];
    render(<TaskTimeline tasks={tasks} currentMs={100} />);
    const buttons = screen.getAllByRole('button');
    buttons[0]?.focus();
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(buttons[0]).toHaveFocus();
  });

  it('calls onSelectTask when a list button is activated', async () => {
    const user = userEvent.setup();
    const onSelectTask = vi.fn();
    render(<TaskTimeline tasks={[makeTask({ taskId: 7 })]} currentMs={100} onSelectTask={onSelectTask} />);
    await user.click(screen.getByRole('button'));
    expect(onSelectTask).toHaveBeenCalledWith(7);
  });

  it('shows a tooltip with task id, partition id, duration, shuffle read and spill on hover', () => {
    const { container } = render(
      <TaskTimeline
        tasks={[makeTask({ taskId: 3, partitionId: 9, launchMs: 0, finishMs: 100, shuffleReadBytes: 2048, diskSpilledBytes: 1024 })]}
        currentMs={100}
      />,
    );
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 240, width: 600, height: 240, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 120 });

    // The hidden accessible list also mentions "Task 3"/"partition 9" (lowercase, comma-
    // separated) for the same task, so match the tooltip's distinct "Task N · Partition N"
    // phrasing rather than a substring that would match both.
    expect(screen.getByText('Task 3 · Partition 9')).toBeInTheDocument();
    expect(screen.getByText(/Shuffle read:/)).toBeInTheDocument();
    expect(screen.getByText(/Spill:/)).toBeInTheDocument();
  });

  it('hides the tooltip on mouse leave', () => {
    const { container } = render(<TaskTimeline tasks={[makeTask()]} currentMs={100} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 240, width: 600, height: 240, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 120 });
    expect(screen.getByText(/Shuffle read:/)).toBeInTheDocument();
    fireEvent.mouseLeave(canvas);
    expect(screen.queryByText(/Shuffle read:/)).not.toBeInTheDocument();
  });
});
