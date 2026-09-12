import { describe, expect, it } from 'vitest';
import { buildTaskQuadtree, findTaskAt } from './quadtree';
import type { TimelineTask } from './draw';

const scaleX = (ms: number) => ms; // 1px per ms, for simple arithmetic
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

describe('buildTaskQuadtree / findTaskAt', () => {
  it('finds the task whose rectangle contains the point', () => {
    const tasks = [makeTask({ taskId: 1, launchMs: 0, finishMs: 100, slot: 0 })];
    const qt = buildTaskQuadtree(tasks, scaleX, laneY, LANE_HEIGHT);
    const found = findTaskAt(qt, 50, 10);
    expect(found?.taskId).toBe(1);
  });

  it('returns undefined for a point outside every rectangle, even if a center is nearby', () => {
    // A single wide, short bar: center is close in y, but a point well outside its x-span
    // (and outside maxDistance) must not report a hit just because the center was nearest.
    const tasks = [makeTask({ taskId: 1, launchMs: 0, finishMs: 20, slot: 0 })];
    const qt = buildTaskQuadtree(tasks, scaleX, laneY, LANE_HEIGHT);
    expect(findTaskAt(qt, 500, 10)).toBeUndefined();
  });

  it('disambiguates two tasks in different lanes', () => {
    const tasks = [
      makeTask({ taskId: 1, slot: 0, launchMs: 0, finishMs: 100 }),
      makeTask({ taskId: 2, slot: 1, launchMs: 0, finishMs: 100 }),
    ];
    const qt = buildTaskQuadtree(tasks, scaleX, laneY, LANE_HEIGHT);
    expect(findTaskAt(qt, 50, 10)?.taskId).toBe(1);
    expect(findTaskAt(qt, 50, 30)?.taskId).toBe(2);
  });

  it('returns undefined for an empty task list', () => {
    const qt = buildTaskQuadtree([], scaleX, laneY, LANE_HEIGHT);
    expect(findTaskAt(qt, 0, 0)).toBeUndefined();
  });
});
