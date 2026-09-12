import { describe, expect, it } from 'vitest';
import { testConfig as config } from '../model/test-helpers';
import { asBytes } from '../types';
import { assignStageIds, buildPlan, selectJoinStrategy } from './build';

describe('selectJoinStrategy', () => {
  const cfg = config();
  const mib = (n: number) => asBytes(n * 1024 * 1024);

  it('chooses BroadcastHashJoin when the other side is under the broadcast threshold', () => {
    const small = mib(cfg.sql.autoBroadcastJoinThresholdMiB - 1);
    expect(selectJoinStrategy(small, cfg, false)).toBe('BroadcastHashJoin');
  });

  it('honours a broadcast hint even when the side is large', () => {
    const large = mib(cfg.sql.autoBroadcastJoinThresholdMiB + 1000);
    expect(selectJoinStrategy(large, cfg, false, true)).toBe('BroadcastHashJoin');
  });

  it('chooses ShuffledHashJoin when moderately larger than the broadcast threshold and preferSortMergeJoin is false', () => {
    const moderate = mib(cfg.sql.autoBroadcastJoinThresholdMiB + 5);
    expect(selectJoinStrategy(moderate, cfg, false)).toBe('ShuffledHashJoin');
  });

  it('chooses SortMergeJoin when the other side is large', () => {
    const large = mib(cfg.sql.autoBroadcastJoinThresholdMiB + 1000);
    expect(selectJoinStrategy(large, cfg, false)).toBe('SortMergeJoin');
  });

  it('chooses SortMergeJoin when preferSortMergeJoin is true, even at a moderate size', () => {
    const moderate = mib(cfg.sql.autoBroadcastJoinThresholdMiB + 5);
    expect(selectJoinStrategy(moderate, cfg, true)).toBe('SortMergeJoin');
  });
});

describe('assignStageIds', () => {
  it('gives Scan/Exchange/BroadcastExchange stage 0 and everything else stage 1', () => {
    const scan = { id: 0, kind: 'Scan' as const, children: [], stageId: 99 };
    const exchange = { id: 1, kind: 'Exchange' as const, children: [scan], stageId: 99 };
    const aggregate = { id: 2, kind: 'Aggregate' as const, children: [exchange], stageId: 99 };

    const result = assignStageIds(aggregate);

    expect(result.stageId).toBe(1);
    expect(result.children[0]?.stageId).toBe(0);
    expect(result.children[0]?.children[0]?.stageId).toBe(0);
  });

  it('matches buildPlan output for an aggregate query', () => {
    const cfg = config({ query: { kind: 'aggregate' } });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.stageId).toBe(1); // Aggregate — the terminal node
    const exchange = plan.children[0];
    expect(exchange?.kind).toBe('Exchange');
    expect(exchange?.stageId).toBe(0);
    expect(exchange?.children[0]?.kind).toBe('Scan');
    expect(exchange?.children[0]?.stageId).toBe(0);
  });
});

describe('buildPlan', () => {
  it('builds Scan -> Exchange -> Aggregate for an aggregate query', () => {
    const cfg = config({ query: { kind: 'aggregate' } });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.kind).toBe('Aggregate');
    expect(plan.children[0]?.kind).toBe('Exchange');
    expect(plan.children[0]?.children[0]?.kind).toBe('Scan');
  });

  it('builds a broadcast join when the other side is small', () => {
    const cfg = config({ query: { kind: 'join', joinType: 'inner', other: { rows: 100, bytesPerRow: 100 } } });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.kind).toBe('BroadcastHashJoin');
    expect(plan.children.map((c) => c.kind).sort()).toEqual(['BroadcastExchange', 'Scan'].sort());
  });

  it('builds a SortMergeJoin with Sort nodes when the other side is large', () => {
    const cfg = config({
      query: { kind: 'join', joinType: 'inner', other: { rows: 50_000_000, bytesPerRow: 128 } },
    });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.kind).toBe('SortMergeJoin');
    expect(plan.children[0]?.kind).toBe('Sort');
    expect(plan.children[1]?.kind).toBe('Sort');
    expect(plan.children[0]?.children[0]?.kind).toBe('Exchange');
  });

  it('deliberately allows the estimated size to be wrong via estimateErrorFactor', () => {
    // A tiny "other" side that the planner is told is huge should NOT get broadcast.
    const cfg = config({
      query: {
        kind: 'join',
        joinType: 'inner',
        other: { rows: 100, bytesPerRow: 100 },
        estimateErrorFactor: 1_000_000,
      },
    });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.kind).not.toBe('BroadcastHashJoin');
  });

  it('builds Scan -> Exchange -> Project for the reserved window kind', () => {
    const cfg = config({ query: { kind: 'window', partitionByKeyCardinality: 10 } });
    const plan = buildPlan(cfg.query, cfg);
    expect(plan.kind).toBe('Project');
    expect(plan.children[0]?.kind).toBe('Exchange');
  });

  it('is deterministic: the same (query, config) always produces the same node ids', () => {
    const cfg = config({ query: { kind: 'aggregate' } });
    const a = buildPlan(cfg.query, cfg);
    const b = buildPlan(cfg.query, cfg);
    expect(a).toEqual(b);
  });
});
