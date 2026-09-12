// Thin wrappers over d3-scale so d3 stays an implementation detail behind this module —
// nothing else in packages/viz imports d3-scale directly. Per ADR-0005, D3 supplies
// computation only (scale/shape/array/interpolate); React renders every element.
import { scaleBand, scaleLinear, type ScaleBand, type ScaleLinear } from 'd3-scale';

export function createLinearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): ScaleLinear<number, number> {
  return scaleLinear().domain(domain).range(range);
}

export function createBandScale(
  domain: readonly string[],
  range: readonly [number, number],
  paddingInner = 0.1,
): ScaleBand<string> {
  return scaleBand<string>().domain(domain).range(range).paddingInner(paddingInner);
}
