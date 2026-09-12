import { describe, expect, it } from 'vitest';
import { chartInnerArea } from './chartMath';

describe('chartInnerArea', () => {
  it('subtracts margins from each side', () => {
    const area = chartInnerArea(400, 200, { top: 10, right: 20, bottom: 30, left: 40 });
    expect(area).toEqual({
      x0: 40,
      y0: 10,
      x1: 380,
      y1: 170,
      innerWidth: 340,
      innerHeight: 160,
    });
  });

  it('never produces a negative inner area when margins exceed the outer size', () => {
    const area = chartInnerArea(50, 50, { top: 40, right: 40, bottom: 40, left: 40 });
    expect(area.innerWidth).toBe(0);
    expect(area.innerHeight).toBe(0);
    expect(area.x1).toBeGreaterThanOrEqual(area.x0);
    expect(area.y1).toBeGreaterThanOrEqual(area.y0);
  });

  it('handles zero margins', () => {
    const area = chartInnerArea(100, 80, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(area).toEqual({ x0: 0, y0: 0, x1: 100, y1: 80, innerWidth: 100, innerHeight: 80 });
  });
});
