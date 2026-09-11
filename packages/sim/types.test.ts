import { describe, expect, it } from 'vitest';
import { asBytes, asMiB, asRenderMs, asSimMs, type Bytes, type MiB } from './types';

describe('branded unit types', () => {
  it('constructs a SimMs value', () => {
    expect(asSimMs(1500)).toBe(1500);
  });

  it('constructs a RenderMs value', () => {
    expect(asRenderMs(12000)).toBe(12000);
  });

  it('constructs a Bytes value', () => {
    expect(asBytes(1024)).toBe(1024);
  });

  it('constructs a MiB value', () => {
    expect(asMiB(1)).toBe(1);
  });

  it('does not allow a Bytes value where a MiB value is expected', () => {
    const b: Bytes = asBytes(1024);
    // @ts-expect-error -- Bytes is not assignable to MiB: mixing byte units without an
    // explicit conversion is exactly the bug class these branded types exist to catch.
    // NOTE: this line is only enforced by `tsc --noEmit` (see SAS-005 CI job) — Vitest's
    // vite-node transform does not type-check. If the branded types ever collapse back to
    // structurally compatible, this directive becomes an "unused @ts-expect-error" error
    // under `strict`, which is what actually fails the build.
    const wrong: MiB = b;
    expect(wrong).toBe(1024);
  });
});
