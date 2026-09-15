// SAS-065 (E7) — renders a plan node to indented text, for the code pane's Diff tab (two
// stacked blocks, not a line-by-line diff — see codeContent.ts for why).
import { PLAN_NODE_LABEL, type PlanTreeNode } from '@sas/viz';

function lines(node: PlanTreeNode, depth: number): string[] {
  const indent = '  '.repeat(depth);
  return [`${indent}${PLAN_NODE_LABEL[node.kind]}`, ...node.children.flatMap((child) => lines(child, depth + 1))];
}

export function renderPlanText(node: PlanTreeNode): string {
  return lines(node, 0).join('\n');
}
