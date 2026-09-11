'use client';

import { useEffect, useRef } from 'react';

// A synthetic scene proving out the CI perf-trace mechanism ahead of M1 (SAS-050..056).
// One rAF loop drawing N dummy rectangles on Canvas, matching the <ClockDriver> shape from
// docs/ARCHITECTURE.md §4 (a single requestAnimationFrame loop, not a CSS transition).
// Internal only — never linked from production nav.
// TODO(SAS-050): once /m/skew's real TaskTimeline exists, repoint e2e/perf.spec.ts at it
// and delete this route.
// Kept modest deliberately: this proves the trace/threshold mechanism, not a worst-case
// load test — a naive fillRect loop at real M1 task counts (up to 10,000, per
// docs/ARCHITECTURE.md §5) would legitimately flake on slower CI runners. Raise this once
// SAS-042's real quadtree-backed TaskTimeline replaces this stub.
const RECT_COUNT = 500;
const DURATION_MS = 10_000;

// Inline hex here (not packages/ui/tokens.css) is acceptable: this route is a disposable
// internal fixture for the CI mechanism, not user-facing product UI.
const COLOR_A = '#c4501e';
const COLOR_B = '#1f7a6c';

type PerfStubWindow = Window & {
  __perfStubFrameDeltas?: number[];
  __perfStubDone?: boolean;
};

export default function PerfStubPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const ctxOrNull = canvasEl?.getContext('2d');
    if (!canvasEl || !ctxOrNull) return;
    // Re-bound as fresh, definitely-non-null consts: TypeScript does not preserve
    // null-narrowing into a callback invoked later (asynchronously, via rAF).
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    const w = window as PerfStubWindow;
    let raf = 0;
    const start = performance.now();
    // Measures per-frame WORK duration (time spent inside the draw call), not the interval
    // between consecutive rAF callbacks. The latter is vsync-bound — at a 60Hz display it
    // averages ~16.67ms regardless of how little work a frame does, which would make any
    // "≤16ms" budget structurally unpassable. What the 16ms budget actually constrains is
    // whether a frame's JS/paint work fits inside one vsync interval.
    const frameDurations: number[] = [];

    function draw(now: number) {
      const workStart = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < RECT_COUNT; i++) {
        const x = (i * 37) % canvas.width;
        const y = (i * 53) % canvas.height;
        ctx.fillStyle = i % 2 === 0 ? COLOR_A : COLOR_B;
        ctx.fillRect(x, y, 4, 4);
      }
      frameDurations.push(performance.now() - workStart);
      w.__perfStubFrameDeltas = frameDurations;
      if (now - start < DURATION_MS) {
        raf = requestAnimationFrame(draw);
      } else {
        w.__perfStubDone = true;
      }
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main>
      <h1>Perf stub</h1>
      <p>Internal only. Exercises the CI perf-trace mechanism ahead of M1 — see SAS-008.</p>
      <canvas ref={canvasRef} width={800} height={600} />
    </main>
  );
}
