import { courseBoundaryAt } from '../../dist/course/course-bands.js';
import { rgb555LinearChannel } from '../../dist/graphics/image-filter.js';

const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
function clipHalfPlane(polygon, a, b, inside) {
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length];
    const pSide = cross(a, b, p),
      qSide = cross(a, b, q);
    const pIn = inside ? pSide >= 0 : pSide <= 0,
      qIn = inside ? qSide >= 0 : qSide <= 0;
    if (pIn) output.push(p);
    if (pIn !== qIn) {
      const t = pSide / (pSide - qSide);
      output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return output;
}
function polygonArea(polygon) {
  let area = 0;
  for (let i = 1; i + 1 < polygon.length; i++) area += cross(polygon[0], polygon[i], polygon[i + 1]);
  return Math.abs(area) / 2;
}

/** Independent offline oracle: subtract later convex paint from uncovered polygons, including transparent paint.
 * Unlike the runtime slab sweep it neither constructs edge arrangements nor uses clippedIntegral.
 */
export function integrateOrderedBandBox(bands, start, end, left, right) {
  if (!(end > start) || !(right > left) || ![start, end, left, right].every(Number.isFinite))
    throw new RangeError('Oracle rectangle must have finite positive area');
  const cuts = new Set([start, end]);
  for (const band of bands) {
    for (const s of [band.start, band.end]) if (s > start && s < end) cuts.add(s);
    for (const boundary of [band.left, band.right])
      for (const knot of boundary.knots) if (knot.anchor.s > start && knot.anchor.s < end) cuts.add(knot.anchor.s);
  }
  const stations = [...cuts].sort((a, b) => a - b);
  let opaque = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i],
      b = stations[i + 1],
      mid = (a + b) / 2;
    let uncovered = [
      [
        [a, left],
        [b, left],
        [b, right],
        [a, right],
      ],
    ];
    for (let order = bands.length - 1; order >= 0 && uncovered.length; order--) {
      const band = bands[order];
      if (mid < band.start || mid >= band.end) continue;
      const polygon = [
        [a, band.openLeft ? left : courseBoundaryAt(band.left, a)],
        [b, band.openLeft ? left : courseBoundaryAt(band.left, b)],
        [b, band.openRight ? right : courseBoundaryAt(band.right, b)],
        [a, band.openRight ? right : courseBoundaryAt(band.right, a)],
      ];
      // Clip open edges to the requested box without reversing a trapezoid entirely outside that box.
      if (band.openLeft) {
        polygon[0][1] = Math.min(left, polygon[3][1]);
        polygon[1][1] = Math.min(left, polygon[2][1]);
      }
      if (band.openRight) {
        polygon[3][1] = Math.max(right, polygon[0][1]);
        polygon[2][1] = Math.max(right, polygon[1][1]);
      }
      if (!polygonArea(polygon)) continue;
      const remaining = [];
      for (const candidate of uncovered) {
        let overlap = candidate;
        for (let edge = 0; edge < polygon.length && overlap.length; edge++) {
          const p = polygon[edge],
            q = polygon[(edge + 1) % polygon.length];
          if (p[0] === q[0] && p[1] === q[1]) continue;
          const outside = clipHalfPlane(overlap, p, q, false);
          if (polygonArea(outside)) remaining.push(outside);
          overlap = clipHalfPlane(overlap, p, q, true);
        }
        if (band.color === null) continue;
        const area = polygonArea(overlap);
        opaque += area;
        red += area * rgb555LinearChannel(band.color >>> 10);
        green += area * rgb555LinearChannel((band.color >>> 5) & 31);
        blue += area * rgb555LinearChannel(band.color & 31);
      }
      uncovered = remaining;
    }
  }
  return {
    coverage: opaque / ((end - start) * (right - left)),
    red: opaque ? red / opaque : 0,
    green: opaque ? green / opaque : 0,
    blue: opaque ? blue / opaque : 0,
  };
}
