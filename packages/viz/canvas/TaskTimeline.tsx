// Canvas Gantt — a controlled component per ADR-0005: it receives `currentMs` as a prop every
// render and paints inside a `useEffect` (a legitimate imperative canvas paint, not derived
// React state); it never runs its own `requestAnimationFrame` loop. A future ClockDriver
// (SAS-072, E8) supplies `currentMs` frame-by-frame — that's also where full
// `prefers-reduced-motion` playback behavior belongs ("reduced-motion handled here and
// nowhere else", ADR-0005); this component only disables its own tooltip transition under it.
'use client';

import { formatBytes, formatDuration } from '@sas/ui';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createLinearScale } from '../primitives';
import { drawTaskTimeline, type TaskTimelineColors, type TimelineTask } from './draw';
import { buildTaskQuadtree, findTaskAt } from './quadtree';
import styles from './TaskTimeline.module.css';

export type { TimelineTask } from './draw';

export interface TaskTimelineProps {
  tasks: TimelineTask[];
  /** The playhead, in simulated ms. Tasks that haven't launched by this point aren't drawn. */
  currentMs: number;
  /** Defaults to [0, max(finishMs)]. */
  domainMs?: [number, number];
  onSelectTask?: (taskId: number) => void;
}

interface Dimensions {
  width: number;
  height: number;
}

const DEFAULT_HEIGHT = 240;
const FALLBACK_COLORS: TaskTimelineColors = { ok: '#c4501e', spilled: '#c78a1e', oom: '#b3261e' };

function resolveColors(el: Element): TaskTimelineColors {
  const style = getComputedStyle(el);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ok: read('--accent', FALLBACK_COLORS.ok),
    spilled: read('--warn', FALLBACK_COLORS.spilled),
    oom: read('--crit', FALLBACK_COLORS.oom),
  };
}

function taskDescription(task: TimelineTask): string {
  const spill = task.memorySpilledBytes + task.diskSpilledBytes;
  return [
    `Task ${task.taskId}`,
    `partition ${task.partitionId}`,
    formatDuration(task.finishMs - task.launchMs),
    `shuffle read ${formatBytes(task.shuffleReadBytes)}`,
    `spill ${formatBytes(spill)}`,
  ].join(', ');
}

export function TaskTimeline(props: TaskTimelineProps): JSX.Element {
  const { tasks, currentMs, domainMs, onSelectTask } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 600, height: DEFAULT_HEIGHT });
  const [tooltip, setTooltip] = useState<{ task: TimelineTask; x: number; y: number } | undefined>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDimensions({ width: entry.contentRect.width, height: DEFAULT_HEIGHT });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const resolvedDomain = useMemo<[number, number]>(() => {
    if (domainMs) return domainMs;
    const maxFinish = tasks.reduce((max, task) => Math.max(max, task.finishMs), 0);
    return [0, Math.max(1, maxFinish)];
  }, [domainMs, tasks]);

  const slots = useMemo(() => {
    const unique = new Set(tasks.map((task) => task.slot));
    return Array.from(unique).sort((a, b) => a - b);
  }, [tasks]);

  const laneHeight = slots.length > 0 ? dimensions.height / slots.length : dimensions.height;

  const scaleX = useMemo(
    () => createLinearScale(resolvedDomain, [0, Math.max(1, dimensions.width)]),
    [resolvedDomain, dimensions.width],
  );

  const laneY = useMemo(() => {
    const indexBySlot = new Map(slots.map((slot, index) => [slot, index]));
    return (slot: number) => (indexBySlot.get(slot) ?? 0) * laneHeight;
  }, [slots, laneHeight]);

  // Built once per [tasks, scaleX, laneY, laneHeight] identity change, not per frame —
  // ADR-0005: "a quadtree built once per RunResult, not a per-frame linear scan."
  const taskQuadtree = useMemo(
    () => buildTaskQuadtree(tasks, scaleX, laneY, laneHeight),
    [tasks, scaleX, laneY, laneHeight],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawTaskTimeline(ctx, tasks, currentMs, scaleX, laneY, laneHeight, resolveColors(container));
  }, [tasks, currentMs, dimensions, scaleX, laneY, laneHeight]);

  function handleMouseMove(event: MouseEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const found = findTaskAt(taskQuadtree, px, py);
    setTooltip(found ? { task: found, x: px, y: py } : undefined);
  }

  function handleMouseLeave(): void {
    setTooltip(undefined);
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      listButtonRefs.current[index + 1]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      listButtonRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="Task timeline"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {tooltip ? (
        <div className={styles.tooltip} style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }} role="status">
          <div>
            Task {tooltip.task.taskId} · Partition {tooltip.task.partitionId}
          </div>
          <div>{formatDuration(tooltip.task.finishMs - tooltip.task.launchMs)}</div>
          <div>Shuffle read: {formatBytes(tooltip.task.shuffleReadBytes)}</div>
          <div>Spill: {formatBytes(tooltip.task.memorySpilledBytes + tooltip.task.diskSpilledBytes)}</div>
        </div>
      ) : null}
      {/* The accessible equivalent of the canvas Gantt — same per-task data, keyboard-
          navigable, present for screen readers via the .srOnly clip pattern. */}
      <ul className={styles.srOnly} aria-label="Task list">
        {tasks.map((task, index) => (
          <li key={task.taskId}>
            <button
              type="button"
              ref={(el) => {
                listButtonRefs.current[index] = el;
              }}
              onClick={() => onSelectTask?.(task.taskId)}
              onKeyDown={(event) => handleListKeyDown(event, index)}
            >
              {taskDescription(task)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
