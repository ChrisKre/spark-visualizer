// Branded unit types. Plain `number` cannot distinguish a millisecond count from a byte
// count from a mebibyte count, and unit confusion is the most likely correctness bug in
// this codebase (see docs/CONTRIBUTING.md — TypeScript conventions). Branding makes mixing
// them a compile error instead of a silent bug.
//
// These are nominal types: TypeScript's structural typing would otherwise treat any two
// `number` aliases as interchangeable, so each brand carries a unique, unused `__brand`
// tag that only the constructor functions below are allowed to attach.

type Brand<T, B extends string> = T & { readonly __brand: B };

/** A duration in the simulator's virtual clock — see ARCHITECTURE.md §4. */
export type SimMs = Brand<number, 'SimMs'>;

/** A duration in real wall-clock render time, after the clock's `speed` mapping. */
export type RenderMs = Brand<number, 'RenderMs'>;

/** A byte count, decimal-agnostic — format with MB/s (throughput) or MiB/GiB (size). */
export type Bytes = Brand<number, 'Bytes'>;

/** A size already expressed in mebibytes. Not interchangeable with a raw `Bytes` count. */
export type MiB = Brand<number, 'MiB'>;

// Constructor functions are the only sanctioned way to produce a branded value. Nothing
// else in the codebase should write a raw `as Bytes` / `as MiB` / ... cast — if you find
// yourself needing one, it is very likely a real unit bug, not a type-system nuisance.
export const asSimMs = (n: number): SimMs => n as SimMs;
export const asRenderMs = (n: number): RenderMs => n as RenderMs;
export const asBytes = (n: number): Bytes => n as Bytes;
export const asMiB = (n: number): MiB => n as MiB;
