// Canvas hit-testing uses a quadtree built once per task list, not a per-frame linear scan
// (ADR-0005). Indexed by each bar's center point; a hover/click point is matched to the
// nearest center within `maxDistance`, then verified against that task's real rectangle so a
// point that lands closer to one bar's center but outside every bar never reports a false hit.
import { quadtree, type Quadtree } from 'd3-quadtree';
import { taskRect, type LaneY, type MsScale, type TimelineTask } from './draw';

interface IndexedTask extends TimelineTask {
  __cx: number;
  __cy: number;
  __halfW: number;
  __halfH: number;
}

export function buildTaskQuadtree(
  tasks: TimelineTask[],
  scaleX: MsScale,
  laneY: LaneY,
  laneHeight: number,
): Quadtree<IndexedTask> {
  const indexed: IndexedTask[] = tasks.map((task) => {
    const rect = taskRect(task, scaleX, laneY, laneHeight);
    return {
      ...task,
      __cx: rect.x + rect.w / 2,
      __cy: rect.y + rect.h / 2,
      __halfW: rect.w / 2,
      __halfH: rect.h / 2,
    };
  });

  return quadtree<IndexedTask>()
    .x((t) => t.__cx)
    .y((t) => t.__cy)
    .addAll(indexed);
}

const DEFAULT_MAX_DISTANCE = 48;

export function findTaskAt(
  qt: Quadtree<IndexedTask>,
  px: number,
  py: number,
  maxDistance = DEFAULT_MAX_DISTANCE,
): TimelineTask | undefined {
  const candidate = qt.find(px, py, maxDistance);
  if (!candidate) return undefined;

  const withinX = Math.abs(px - candidate.__cx) <= candidate.__halfW;
  const withinY = Math.abs(py - candidate.__cy) <= candidate.__halfH;
  return withinX && withinY ? candidate : undefined;
}
