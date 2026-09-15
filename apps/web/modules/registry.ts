// apps/web/modules — per-module composition (docs/ARCHITECTURE.md §2). `registry.ts` is the
// one place that lists which modules exist; `/m/[moduleId]`'s `generateStaticParams` and the
// nav both read it, so adding a module never means touching route or nav code again.
//
// SAS-070 (E8) creates this file empty on purpose — the app shell and routing mechanism must
// work before any module exists. SAS-050 (E6) adds the first entry, `skew`.
export interface ModuleMeta {
  id: string;
  /** Nav label and page heading. */
  title: string;
  /** One line, shown under the nav link and as the route's meta description. */
  summary: string;
}

export const MODULE_REGISTRY: ModuleMeta[] = [];

export function findModule(id: string): ModuleMeta | undefined {
  return MODULE_REGISTRY.find((module) => module.id === id);
}
