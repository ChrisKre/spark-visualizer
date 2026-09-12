// SAS-026 — the calibration CI gate. Per D4, this rides the existing Vitest `test` job rather
// than adding a Python CI step: docs/SIMULATOR_SPEC.md §5 phrases "modelled vs measured MAE ≤ 12%
// across all committed fixtures" as a test class, and tools/capture/README.md already documents
// tools/capture/calibrate.py (Python) as manual, offline tooling.
//
// Reconstructs modeled-vs-measured stage wall clock the same way tools/capture/calibrate.py's
// compute_residuals does, but reuses @sas/sim's REAL exported spill/GC functions
// (estimateSpill, computeGcMs, executionCeilingPerTask) rather than reimplementing them — the
// read/compute/sort/shuffle-write terms below are the only ones hand-written, and are simple
// one-line mirrors of packages/sim/model/cost.ts's formula.
import { describe, expect, it } from 'vitest';
import { computeGcMs, estimateSpill, executionCeilingPerTask } from '@sas/sim';
import type { RunConfig } from '@sas/sim';
import * as K from '@sas/sim';
import { listFixtureIds, loadFixture } from './loader';
import type { ValidatedFixtureTask } from './schema';

const BYTES_PER_MIB = 1024 * 1024;

/** Mirrors packages/sim/model/cost.ts's bytesToMs exactly: MiB/throughput is in seconds. */
function bytesToMs(bytes: number, throughputMBps: number): number {
  if (throughputMBps <= 0) return 0;
  return (bytes / BYTES_PER_MIB / throughputMBps) * 1000;
}

function taskRole(task: ValidatedFixtureTask): 'map' | 'reduce' {
  return task.stageId === 0 ? 'map' : 'reduce';
}

/** Reconstructs `baseMs` (= finishMs - launchMs - fetchWaitMs) from a fixture task's own
 * recorded features and the live cost-model constants — see packages/sim/model/cost.ts. */
function modeledBaseMs(task: ValidatedFixtureTask, involvesSort: boolean, runConfig: RunConfig): number {
  const role = taskRole(task);
  const ceilingBytes = executionCeilingPerTask(runConfig, 0);
  const heapPressure = ceilingBytes > 0 ? Math.min(task.peakExecutionMemoryBytes / ceilingBytes, 1.4) : 1.4;

  const deserializeMs = K.DESERIALIZE_MS_PER_TASK;
  const readMs = role === 'map' ? bytesToMs(task.inputBytes, K.READ_THROUGHPUT_MBPS) : 0;
  const computeMs = (task.rows * K.CPU_NS_PER_ROW) / 1e6;
  const sortMs = role === 'reduce' && involvesSort && task.rows > 1 ? (task.rows * Math.log2(task.rows) * K.SORT_NS_PER_ROW_LOG) / 1e6 : 0;
  const shuffleWriteMs = role === 'map' ? bytesToMs(task.shuffleWriteBytes, K.SHUFFLE_WRITE_THROUGHPUT_MBPS) : 0;
  const spill = estimateSpill(task.peakExecutionMemoryBytes, ceilingBytes);
  const gcMs = computeGcMs(heapPressure);

  return deserializeMs + readMs + computeMs + sortMs + shuffleWriteMs + spill.spillPenaltyMs + gcMs;
}

function meanAbsoluteError(pairs: Array<{ measured: number; modeled: number }>): number {
  const nonZero = pairs.filter((p) => p.measured !== 0);
  if (nonZero.length === 0) return 0;
  const total = nonZero.reduce((sum, p) => sum + Math.abs(p.modeled - p.measured) / p.measured, 0);
  return total / nonZero.length;
}

describe('calibration MAE gate (docs/FIXTURES.md §6, docs/SIMULATOR_SPEC.md §5)', () => {
  it('stage wall-clock MAE stays <= 12% across every committed fixture', () => {
    const pairs: Array<{ measured: number; modeled: number }> = [];

    for (const id of listFixtureIds()) {
      const fixture = loadFixture(id);
      const involvesSort = fixture.plan.final.kind === 'Sort' || fixture.plan.final.kind === 'SortMergeJoin';
      const modeledFinishByTaskId = new Map<number, number>();

      for (const task of fixture.tasks) {
        const baseMs = modeledBaseMs(task, involvesSort, fixture.runConfig);
        modeledFinishByTaskId.set(task.taskId, task.launchMs + baseMs + task.fetchWaitMs);
      }

      for (const stage of fixture.stages) {
        const modeledFinishes = stage.taskIds.map((taskId) => modeledFinishByTaskId.get(taskId)).filter((f): f is number => f !== undefined);
        if (modeledFinishes.length === 0) continue;

        const modeledWallClock = Math.max(...modeledFinishes) - stage.launchMs;
        const measuredWallClock = stage.finishMs - stage.launchMs;
        pairs.push({ measured: measuredWallClock, modeled: modeledWallClock });
      }
    }

    const mae = meanAbsoluteError(pairs);
    expect(pairs.length).toBeGreaterThan(0);
    expect(mae).toBeLessThanOrEqual(0.12);
  });
});
