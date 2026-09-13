import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { MODULE_COMPONENTS } from '../../../modules/components';
import { findModule, MODULE_REGISTRY } from '../../../modules/registry';

// SAS-070 (E8) — `output: 'export'` (docs/ARCHITECTURE.md §7) needs every route's params
// known at build time. `dynamicParams = false` makes that a hard rule: a moduleId not in the
// registry 404s instead of falling through to an unbuilt server render, which doesn't exist
// on a static export anyway.
export const dynamicParams = false;

interface ModulePageProps {
  params: Promise<{ moduleId: string }>;
}

export function generateStaticParams(): Array<{ moduleId: string }> {
  return MODULE_REGISTRY.map((module) => ({ moduleId: module.id }));
}

export async function generateMetadata({ params }: ModulePageProps): Promise<Metadata> {
  const { moduleId } = await params;
  const moduleMeta = findModule(moduleId);
  return moduleMeta
    ? { title: `${moduleMeta.title} — Shuffle & Spill`, description: moduleMeta.summary }
    : {};
}

export default async function ModulePage({ params }: ModulePageProps): Promise<JSX.Element> {
  const { moduleId } = await params;
  const moduleMeta = findModule(moduleId);
  if (!moduleMeta) notFound();

  const ModuleComponent = MODULE_COMPONENTS[moduleId];
  if (!ModuleComponent) {
    // Registered but not yet composed — see apps/web/modules/components.tsx. Shouldn't be
    // reachable once every registry entry has a matching component, but fails legibly rather
    // than silently rendering nothing if it ever drifts.
    return (
      <>
        <h1>{moduleMeta.title}</h1>
        <p>Module scaffold — composition not wired yet.</p>
      </>
    );
  }

  return <ModuleComponent />;
}
