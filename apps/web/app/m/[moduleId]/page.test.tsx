import { describe, expect, it, vi } from 'vitest';
import { SkewModule } from '../../../modules/skew/SkewModule';

class NotFoundError extends Error {}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('not found');
  },
}));

describe('/m/[moduleId]', () => {
  it('generateStaticParams lists exactly the registered modules', async () => {
    const { generateStaticParams } = await import('./page');
    expect(generateStaticParams()).toEqual([{ moduleId: 'skew' }]);
  });

  it('generateMetadata resolves the module title/summary, and {} for an unknown id', async () => {
    const { generateMetadata } = await import('./page');
    const known = await generateMetadata({ params: Promise.resolve({ moduleId: 'skew' }) });
    expect(known.title).toContain('Data skew & salting');

    const unknown = await generateMetadata({ params: Promise.resolve({ moduleId: 'nope' }) });
    expect(unknown).toEqual({});
  });

  it('renders the registered component for a known moduleId', async () => {
    const ModulePage = (await import('./page')).default;
    const element = await ModulePage({ params: Promise.resolve({ moduleId: 'skew' }) });
    expect(element.type).toBe(SkewModule);
  });

  it('calls notFound() for an unregistered moduleId', async () => {
    const ModulePage = (await import('./page')).default;
    await expect(ModulePage({ params: Promise.resolve({ moduleId: 'nope' }) })).rejects.toThrow(NotFoundError);
  });
});
