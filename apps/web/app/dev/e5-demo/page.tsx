'use client';

// Internal only — every packages/viz component from E5, fed synthetic data so they can
// actually be looked at ahead of E6's real M1 wiring. Not linked from production nav, and not
// itself a ticket deliverable (no acceptance criteria here) — same spirit as ../perf-stub.
import { useState } from 'react';
import {
  Badge,
  MemoryBar,
  MetricRibbon,
  PartitionHistogram,
  PlanTree,
  TaskTimeline,
  type PlanRewrite,
  type PlanTreeNode,
  type TimelineTask,
} from '@sas/viz';

function skewedPartitionBytes(count: number, hotBytes: number, coldBaseBytes: number): number[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? hotBytes : coldBaseBytes + (i % 7) * 5_000));
}

const BEFORE_PARTITIONS = skewedPartitionBytes(200, 4_400_000_000, 20_000_000);
const AFTER_PARTITIONS = skewedPartitionBytes(200, 220_000_000, 200_000_000);

function makeTasks(): TimelineTask[] {
  const slots = 8;
  return Array.from({ length: 60 }, (_, i) => {
    const slot = i % slots;
    const isStraggler = i === 0;
    const launchMs = isStraggler ? 0 : Math.floor(i / slots) * 500 + slot * 20;
    const duration = isStraggler ? 9000 : 300 + (i % 5) * 120;
    return {
      taskId: i,
      stageId: 1,
      slot,
      partitionId: i,
      launchMs,
      finishMs: launchMs + duration,
      shuffleReadBytes: isStraggler ? 4_400_000_000 : 20_000_000,
      memorySpilledBytes: isStraggler ? 800_000_000 : 0,
      diskSpilledBytes: isStraggler ? 1_200_000_000 : 0,
      status: isStraggler ? ('spilled' as const) : ('ok' as const),
    };
  });
}

const TASKS = makeTasks();
const RUN_DURATION_MS = Math.max(...TASKS.map((task) => task.finishMs));

const SCAN_A: PlanTreeNode = { id: 1, kind: 'Scan', stageId: 0, children: [] };
const SCAN_B: PlanTreeNode = { id: 2, kind: 'Scan', stageId: 0, children: [] };
const INITIAL_PLAN: PlanTreeNode = {
  id: 5,
  kind: 'SortMergeJoin',
  stageId: 2,
  children: [
    { id: 3, kind: 'Exchange', stageId: 1, partitionCount: 200, children: [SCAN_A] },
    { id: 4, kind: 'Exchange', stageId: 1, partitionCount: 200, children: [SCAN_B] },
  ],
};
const FINAL_PLAN: PlanTreeNode = {
  id: 10,
  kind: 'SortMergeJoin',
  stageId: 2,
  children: [
    { id: 8, kind: 'Exchange', stageId: 1, partitionCount: 17, children: [{ id: 6, kind: 'Scan', stageId: 0, children: [] }] },
    { id: 9, kind: 'Exchange', stageId: 1, partitionCount: 17, children: [{ id: 7, kind: 'Scan', stageId: 0, children: [] }] },
  ],
};
const REWRITE: PlanRewrite = {
  rule: 'coalesceShufflePartitions',
  atMs: 2500,
  producingStageId: 1,
  description: 'coalesced 200 -> 17 partitions',
  before: INITIAL_PLAN,
  after: FINAL_PLAN,
};

export default function E5DemoPage() {
  const [taskMs, setTaskMs] = useState(RUN_DURATION_MS);
  const [planMs, setPlanMs] = useState(3000);

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
      <div>
        <h1>E5 demo</h1>
        <p>Internal only — synthetic data, every packages/viz component. Not production nav.</p>
      </div>

      <section>
        <h2>Badge</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Badge provenance="measured" />
          <Badge provenance="modeled" />
          <Badge provenance="executed" />
        </div>
      </section>

      <section>
        <h2>MetricRibbon — compare mode</h2>
        <MetricRibbon
          mode="compare"
          before={{
            wallClockMs: 42_300,
            cpuSeconds: 96,
            stragglerRatio: 18.4,
            shuffleReadBytes: 4_400_000_000,
            diskSpilledBytes: 1_200_000_000,
            gcPercent: 22.1,
          }}
          after={{
            wallClockMs: 3_100,
            cpuSeconds: 98,
            stragglerRatio: 1.3,
            shuffleReadBytes: 220_000_000,
            diskSpilledBytes: 0,
            gcPercent: 2.4,
          }}
        />
      </section>

      <section>
        <h2>PartitionHistogram</h2>
        <PartitionHistogram
          panes={[
            { label: 'before (salt=1)', partitionBytes: BEFORE_PARTITIONS },
            { label: 'after (salt=8)', partitionBytes: AFTER_PARTITIONS },
          ]}
        />
      </section>

      <section>
        <h2>TaskTimeline</h2>
        <input
          type="range"
          min={0}
          max={RUN_DURATION_MS}
          value={taskMs}
          onChange={(event) => setTaskMs(Number(event.target.value))}
          style={{ width: '100%' }}
        />
        <p>t = {taskMs} ms</p>
        <TaskTimeline tasks={TASKS} currentMs={taskMs} />
      </section>

      <section>
        <h2>PlanTree</h2>
        <input
          type="range"
          min={0}
          max={5000}
          value={planMs}
          onChange={(event) => setPlanMs(Number(event.target.value))}
          style={{ width: '100%' }}
        />
        <p>t = {planMs} ms (rewrite fires at 2500ms)</p>
        <PlanTree initial={INITIAL_PLAN} final={FINAL_PLAN} rewrites={[REWRITE]} currentMs={planMs} />
      </section>

      <section>
        <h2>MemoryBar</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <MemoryBar
            executionMemoryBytes={2_800_000_000}
            storageMemoryBytes={900_000_000}
            executionCapacityBytes={3_000_000_000}
            storageCapacityBytes={2_000_000_000}
            spilledBytes={1_200_000_000}
            label="executor-3"
          />
          <MemoryBar
            executionMemoryBytes={3_800_000_000}
            storageMemoryBytes={200_000_000}
            executionCapacityBytes={3_000_000_000}
            storageCapacityBytes={2_000_000_000}
            spilledBytes={0}
            label="executor-7 (OOM)"
          />
        </div>
      </section>
    </main>
  );
}
