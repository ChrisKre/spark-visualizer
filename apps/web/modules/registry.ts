// apps/web/modules — per-module composition (docs/ARCHITECTURE.md §2). `registry.ts` is the
// one place that lists which modules exist; `/m/[moduleId]`'s `generateStaticParams` and the
// nav both read it, so adding a module never means touching route or nav code again.
import { SUMMARY as SKEW_SUMMARY, TITLE as SKEW_TITLE } from './skew/copy';

export interface ModuleMeta {
  id: string;
  /** Nav label and page heading. */
  title: string;
  /** One line, shown under the nav link and as the route's meta description. */
  summary: string;
}

export const MODULE_REGISTRY: ModuleMeta[] = [{ id: 'skew', title: SKEW_TITLE, summary: SKEW_SUMMARY }];

export function findModule(id: string): ModuleMeta | undefined {
  return MODULE_REGISTRY.find((module) => module.id === id);
}
