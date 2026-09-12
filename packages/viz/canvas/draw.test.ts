import { describe, expect, it, vi } from 'vitest';
import { drawTaskTimeline, taskRect, type TimelineTask } from './draw';

const scaleX = (ms: number) => ms / 10; // 1px per 10ms
const laneY = (slot: number) => slot * 20;
const LANE_HEIGHT = 20;

function makeTask(overrides: Partial<TimelineTask> = {}): TimelineTask {
  return {
    taskId: 1,
    stageId: 0,
    slot: 0,
    partitionId: 0,
    launchMs: 0,
    finishMs: 100,
    shuffleReadBytes: 0,
    memorySpilledBytes: 0,
    diskSpilledBytes: 0,
    status: 'ok',
    ...overrides,
  };
}

describe('taskRect', () => {
  it('maps launch/finish through scaleX and slot through laneY', () => {
    const task = makeTask({ launchMs: 50, finishMs: 150, slot: 2 });
    expect(taskRect(task, scaleX, laneY, LANE_HEIGHT)).toEqual({ x: 5, y: 40, w: 10, h: 20 });
  });

  it('never produces a zero-or-negative width for a zero-duration task', () => {
    const task = makeTask({ launchMs: 50, finishMs: 50 });
    const rect = taskRect(task, scaleX, laneY, LANE_HEIGHT);
    expect(rect.w).toBeGreaterThan(0);
  });
});

function mockContext() {
  return {
    canvas: { width: 800, height: 200 },
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}

const COLORS = { ok: 'okColor', spilled: 'spilledColor', oom: 'oomColor' };

describe('drawTaskTimeline', () => {
  it('clears the canvas once before drawing', () => {
    const ctx = mockContext();
    drawTaskTimeline(ctx, [], 1000, scaleX, laneY, LANE_HEIGHT, COLORS);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 200);
  });

  it('skips a task that has not launched by currentMs', () => {
    const ctx = mockContext();
    drawTaskTimeline(ctx, [makeTask({ launchMs: 500, finishMs: 600 })], 100, scaleX, laneY, LANE_HEIGHT, COLORS);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it('draws a fully finished task at its full width', () => {
    const ctx = mockContext();
    drawTaskTimeline(ctx, [makeTask({ launchMs: 0, finishMs: 100 })], 1000, scaleX, laneY, LANE_HEIGHT, COLORS);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 10, LANE_HEIGHT);
  });

  it('clips an in-flight task to the playhead position', () => {
    const ctx = mockContext();
    // task spans 0-100ms (0-10px); currentMs=50 -> playhead at 5px, so width should clip to 5.
    drawTaskTimeline(ctx, [makeTask({ launchMs: 0, finishMs: 100 })], 50, scaleX, laneY, LANE_HEIGHT, COLORS);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 5, LANE_HEIGHT);
  });

  it('picks fillStyle from the status-to-color map', () => {
    const ctx = mockContext();
    drawTaskTimeline(ctx, [makeTask({ status: 'oom' })], 1000, scaleX, laneY, LANE_HEIGHT, COLORS);
    expect(ctx.fillStyle).toBe('oomColor');
  });
});
