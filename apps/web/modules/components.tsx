// The moduleId -> composed-module-component lookup `/m/[moduleId]/page.tsx` renders from.
// Split from registry.ts (which is metadata only, imported by server code that must stay
// framework-agnostic) because this file imports real React components.
import type { ComponentType } from 'react';
import { SkewModule } from './skew/SkewModule';

export const MODULE_COMPONENTS: Record<string, ComponentType> = { skew: SkewModule };
