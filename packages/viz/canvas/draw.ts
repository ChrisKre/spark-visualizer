// Pure, DOM-free geometry and paint functions. Kept separate from TaskTimeline.tsx so the
// coordinate math and the canvas paint sequence can be unit-tested without a real <canvas>
// (jsdom implements neither `getContext('2d')` nor real layout) — see draw.test.ts, which
// passes a hand-mocked CanvasRenderingContext2D and asserts call args directly.

export interface TimelineTask {
  taskId: number;
  stageId: number;
  slot: number;
  partitionId: number;
  launchMs: number;
  finishMs: number;
  shuffleReadBytes: number;
  memorySpilledBytes: number;
  diskSpilledBytes: number;
  status: 'ok' | 'spilled' | 'oom';
}

export interface TaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Maps simulated milliseconds to pixels. */
export type MsScale = (ms: number) => number;
/** Maps a scheduler slot index to its lane's y-coordinate. */
export type LaneY = (slot: number) => number;

export function taskRect(task: TimelineTask, scaleX: MsScale, laneY: LaneY, laneHeight: number): TaskRect {
  const x = scaleX(task.launchMs);
  const w = Math.max(0.5, scaleX(task.finishMs) - x);
  return { x, y: laneY(task.slot), w, h: laneHeight };
}

export interface TaskTimelineColors {
  ok: string;
  spilled: string;
  oom: string;
}

function colorFor(status: TimelineTask['status'], colors: TaskTimelineColors): string {
  return colors[status];
}

/**
 * Draws every task that has launched by `currentMs`, clipping the bar's right edge to the
 * playhead so an in-flight task appears to grow rather than snapping fully drawn into being.
 * Never reads the DOM or the clock itself — `currentMs` and `colors` are supplied by the
 * caller every paint (packages/viz/canvas is a controlled component; see ADR-0005).
 */
export function drawTaskTimeline(
  ctx: CanvasRenderingContext2D,
  tasks: TimelineTask[],
  currentMs: number,
  scaleX: MsScale,
  laneY: LaneY,
  laneHeight: number,
  colors: TaskTimelineColors,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const task of tasks) {
    if (task.launchMs > currentMs) continue;

    const rect = taskRect(task, scaleX, laneY, laneHeight);
    const playheadX = scaleX(currentMs);
    const width = Math.max(0.5, Math.min(rect.w, playheadX - rect.x));

    ctx.fillStyle = colorFor(task.status, colors);
    ctx.fillRect(rect.x, rect.y, width, rect.h);
  }
}
