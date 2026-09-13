import { asSimMs } from '@sas/sim';
import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from './useAppStore';

afterEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe('useAppStore', () => {
  it('setModule replaces knobs with the new defaults and resets compare + clock', () => {
    useAppStore.getState().setKnob('a', 1.6);
    useAppStore.getState().setCompare(true);
    useAppStore.getState().setT(asSimMs(5000));

    useAppStore.getState().setModule('skew', { a: 0, salt: 1 });

    const state = useAppStore.getState();
    expect(state.moduleId).toBe('skew');
    expect(state.knobs).toEqual({ a: 0, salt: 1 });
    expect(state.compare).toBe(false);
    expect(state.clock.t).toBe(0);
  });

  it('setKnob updates one key without touching the others', () => {
    useAppStore.getState().setKnobs({ a: 0, salt: 1, nulls: 0 });
    useAppStore.getState().setKnob('salt', 8);
    expect(useAppStore.getState().knobs).toEqual({ a: 0, salt: 8, nulls: 0 });
  });

  it('setDuration clamps a t that now exceeds the new duration', () => {
    useAppStore.getState().setDuration(asSimMs(10_000));
    useAppStore.getState().setT(asSimMs(9_000));
    useAppStore.getState().setDuration(asSimMs(3_000));
    expect(useAppStore.getState().clock.t).toBe(3_000);
  });

  it('setT clamps to [0, duration]', () => {
    useAppStore.getState().setDuration(asSimMs(1_000));
    useAppStore.getState().setT(asSimMs(-50));
    expect(useAppStore.getState().clock.t).toBe(0);
    useAppStore.getState().setT(asSimMs(5_000));
    expect(useAppStore.getState().clock.t).toBe(1_000);
  });

  it('step moves the playhead and clamps at both ends', () => {
    useAppStore.getState().setDuration(asSimMs(1_000));
    useAppStore.getState().setT(asSimMs(500));

    useAppStore.getState().step(asSimMs(200));
    expect(useAppStore.getState().clock.t).toBe(700);

    useAppStore.getState().step(asSimMs(-2_000));
    expect(useAppStore.getState().clock.t).toBe(0);

    useAppStore.getState().step(asSimMs(5_000));
    expect(useAppStore.getState().clock.t).toBe(1_000);
  });

  it('play/pause and setSpeed only touch the clock slice', () => {
    useAppStore.getState().play();
    expect(useAppStore.getState().clock.playing).toBe(true);
    useAppStore.getState().setSpeed(4);
    expect(useAppStore.getState().clock.speed).toBe(4);
    expect(useAppStore.getState().clock.playing).toBe(true);
    useAppStore.getState().pause();
    expect(useAppStore.getState().clock.playing).toBe(false);
  });
});
