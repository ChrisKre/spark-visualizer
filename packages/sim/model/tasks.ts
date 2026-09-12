// SAS-014 — turns one plan node + a stage's partition stats into one TaskCost per partition.

import type { PartitionStats } from '../skew/partition';
import type { PlanNode, RunConfig } from '../types';
import { computeTaskCost, type TaskCost, type TaskRole } from './cost';

export function generateStageTasks(
  node: PlanNode,
  partitions: PartitionStats[],
  config: RunConfig,
  role: TaskRole
): TaskCost[] {
  return partitions.map((partition) => computeTaskCost(node, partition, config, role));
}
