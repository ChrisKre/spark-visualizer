// Pure geometry helper shared by every chart: turns an outer viewBox size + margin into the
// inner plot rectangle every scale's range is built from.
export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartInnerArea {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  innerWidth: number;
  innerHeight: number;
}

export function chartInnerArea(width: number, height: number, margin: ChartMargin): ChartInnerArea {
  const x0 = margin.left;
  const y0 = margin.top;
  const x1 = Math.max(x0, width - margin.right);
  const y1 = Math.max(y0, height - margin.bottom);
  return {
    x0,
    y0,
    x1,
    y1,
    innerWidth: x1 - x0,
    innerHeight: y1 - y0,
  };
}
