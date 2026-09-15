// The moduleId -> composed-module-component lookup `/m/[moduleId]/page.tsx` renders from.
// Split from registry.ts (which is metadata only, imported by server code that must stay
// framework-agnostic) because this file imports real React components — SAS-050 adds the
// first one, `skew`.
import type { ComponentType } from 'react';

export const MODULE_COMPONENTS: Record<string, ComponentType> = {};
