import { sampleGuideSegment, type GuidePath } from '../core/guide-curve.js';
import { guideEnvelopeRange } from '../core/guide-envelope.js';
import { normalFromHeading, wrapAngle, type Vec2 } from '../core/math.js';
import { profileIndexAt } from '../core/open-profile.js';
import { rasterPathToWorld, type RasterPath } from '../core/raster-path.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import { courseBoundaryAt, type CompiledBandPartition, type CompiledBoundary } from './course-bands.js';

/** Work bound, not a distance guard or a promise that a product consumer fits. */
export const COURSE_GEOMETRY_WINDOW_LIMITS = Object.freeze({ cellsPerMapping: 1024 });

interface GeometrySource {
  readonly raster: RasterPath;
  readonly guide: GuidePath;
  readonly bandPartition: CompiledBandPartition;
}
interface Interval {
  readonly sStart: number;
  readonly sEnd: number;
}
interface Cell extends Interval {
  readonly segmentIndex: number;
  readonly hull: readonly Vec2[];
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}
interface GeometryWindowDiagnostic {
  readonly code: 'resource_limit' | 'ambiguous_geometry';
  readonly mapping: 'raster' | 'guide';
  readonly message: string;
  readonly intervals?: readonly Interval[];
}
interface CompiledGeometryWindow {
  readonly scope: 'local-geometry';
  readonly source: GeometrySource;
  readonly interval: Interval;
  readonly cells: { readonly raster: number; readonly guide: number };
}
type GeometryWindowResult =
  | { readonly ok: true; readonly value: CompiledGeometryWindow }
  | { readonly ok: false; readonly diagnostics: readonly GeometryWindowDiagnostic[] };

function turn(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function convexHull(points: readonly Vec2[]): Vec2[] {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (values: readonly Vec2[]): Vec2[] => {
    const result: Vec2[] = [];
    for (const point of values) {
      while (result.length >= 2 && turn(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  return [...half(ordered), ...half(ordered.reverse())];
}
function cell(segmentIndex: number, sStart: number, sEnd: number, points: readonly Vec2[]): Cell {
  const hull = convexHull(points);
  return {
    segmentIndex,
    sStart,
    sEnd,
    hull,
    minX: Math.min(...hull.map((p) => p.x)),
    maxX: Math.max(...hull.map((p) => p.x)),
    minZ: Math.min(...hull.map((p) => p.z)),
    maxZ: Math.max(...hull.map((p) => p.z)),
  };
}
function separated(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  return a.some((point, index) => {
    const next = a[(index + 1) % a.length]!;
    const edgeLength = Math.hypot(next.x - point.x, next.z - point.z);
    return b.every((other) => turn(point, next, other) < -GEOMETRY_SAMPLING_TOLERANCE_METERS * edgeLength);
  });
}
function conflict(cells: readonly Cell[]): readonly Interval[] | null {
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const a = cells[i]!,
        b = cells[j]!;
      // Admitted positive Jacobians separate incident cells at their common cross-section.
      if (b.segmentIndex - a.segmentIndex <= 1) continue;
      const tolerance = GEOMETRY_SAMPLING_TOLERANCE_METERS;
      if (
        a.maxX < b.minX - tolerance ||
        b.maxX < a.minX - tolerance ||
        a.maxZ < b.minZ - tolerance ||
        b.maxZ < a.minZ - tolerance
      )
        continue;
      if (!separated(a.hull, b.hull) && !separated(b.hull, a.hull))
        return Object.freeze([a, b].map(({ sStart, sEnd }) => Object.freeze({ sStart, sEnd })));
    }
  }
  return null;
}

function rasterCells(source: GeometrySource, interval: Interval): Cell[] | null {
  const { raster, bandPartition } = source,
    { sStart, sEnd } = interval;
  const boundaries = [...new Set(bandPartition.bands.flatMap((band) => [band.left, band.right]))];
  const stations = new Set([sStart, sEnd]);
  const add = (s: number) => {
    if (s > sStart && s < sEnd) stations.add(s);
  };
  const first = profileIndexAt(raster.segments, 'sStart', sStart);
  for (let i = first + 1; i < raster.segments.length && raster.segments[i]!.sStart < sEnd; i += 1)
    add(raster.segments[i]!.sStart);
  for (const boundary of boundaries) for (const knot of boundary.knots) add(knot.anchor.s);
  for (const band of bandPartition.bands) {
    add(band.start.s);
    add(band.end.s);
  }
  if (stations.size - 1 > COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping) return null;
  const sorted = [...stations].sort((a, b) => a - b);
  let index = first;
  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1]!;
    while (index + 1 < raster.segments.length && raster.segments[index + 1]!.sStart <= start) index += 1;
    const bands = bandPartition.bands
      .filter((b) => b.start.s <= start && b.end.s >= end)
      .sort(
        (a, b) =>
          courseBoundaryAt(a.left, start) +
          courseBoundaryAt(a.left, end) -
          courseBoundaryAt(b.left, start) -
          courseBoundaryAt(b.left, end),
      );
    if (!bands.length) throw new Error('Admitted partition lost active coverage');
    const edge = (boundary: CompiledBoundary): Vec2[] => {
      const l0 = courseBoundaryAt(boundary, start),
        l1 = courseBoundaryAt(boundary, end);
      const p = rasterPathToWorld(raster, start, l0),
        q = rasterPathToWorld(raster, end, l1);
      const mid = rasterPathToWorld(raster, (start + end) / 2, (l0 + l1) / 2);
      // Exact quadratic Bernstein enclosure, not a sampled-corner approximation.
      return [p, { x: 2 * mid.x - (p.x + q.x) / 2, z: 2 * mid.z - (p.z + q.z) / 2 }, q];
    };
    return cell(index, start, end, [...edge(bands[0]!.left), ...edge(bands.at(-1)!.right)]);
  });
}

function guideCells(guide: GuidePath, interval: Interval): Cell[] | null {
  const selected = guide.segments.filter((s) => s.sStart < interval.sEnd && s.sEnd > interval.sStart);
  if (selected.length > COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping) return null;
  return selected.map((segment) => {
    const start = Math.max(interval.sStart, segment.sStart),
      end = Math.min(interval.sEnd, segment.sEnd);
    const extent = guideEnvelopeRange(guide.envelope, start, end).max;
    const a = sampleGuideSegment(guide, segment, start),
      b = sampleGuideSegment(guide, segment, end);
    const edge = (l: number): Vec2[] => {
      const na = normalFromHeading(a.heading),
        nb = normalFromHeading(b.heading);
      const p = { x: a.x + na.x * l, z: a.z + na.z * l };
      const q = { x: b.x + nb.x * l, z: b.z + nb.z * l };
      if (segment.kind === 'straight') return [p, q];
      const corner = guide.corners[segment.cornerIndex]!;
      if (!corner.center) throw new Error('Admitted Guide arc lost its center');
      const halfTurn = wrapAngle(b.heading - a.heading) / 2;
      const n = normalFromHeading(a.heading + halfTurn);
      const radius = corner.radius - Math.sign(corner.turn) * l;
      // The endpoints and intersection of their tangents enclose the complete circular arc.
      const distance = (-Math.sign(corner.turn) * radius) / Math.cos(halfTurn);
      return [p, { x: corner.center.x + n.x * distance, z: corner.center.z + n.z * distance }, q];
    };
    return cell(segment.index, start, end, [...edge(-extent), ...edge(extent)]);
  });
}

/**
 * Qualify one closed source-chainage window, not the Section as a geographic map. The caller owns
 * actual consumer coverage, occurrence/height selection and keeping all queries inside this window.
 * Ordinary geometric ambiguity is a structured qualification failure, not an authoring JSON pointer.
 */
export function compileCourseGeometryWindow(source: GeometrySource, interval: Interval): GeometryWindowResult {
  if (
    !source ||
    !source.raster ||
    !source.guide ||
    !source.bandPartition ||
    !Array.isArray(source.raster.segments) ||
    !Array.isArray(source.raster.vertexS) ||
    !Array.isArray(source.guide.segments) ||
    !Array.isArray(source.guide.corners) ||
    !Array.isArray(source.guide.envelope) ||
    !source.bandPartition.raster ||
    !Array.isArray(source.bandPartition.bands) ||
    !interval ||
    typeof interval.sStart !== 'number' ||
    typeof interval.sEnd !== 'number'
  )
    throw new TypeError('Geometry window requires compiled reader facets and numeric interval endpoints');
  const { raster, guide, bandPartition } = source,
    { sStart, sEnd } = interval;
  if (guide.raster !== raster || bandPartition.raster !== raster || bandPartition.length !== raster.length)
    throw new RangeError('Geometry window facets must share the canonical Raster ruler');
  if (![sStart, sEnd].every(Number.isFinite) || sStart < 0 || sEnd > raster.length || !(sEnd > sStart))
    throw new RangeError('Geometry window must have positive extent inside the source ruler');
  const rasterWindow = rasterCells(source, interval),
    guideWindow = guideCells(guide, interval);
  const diagnostics: GeometryWindowDiagnostic[] = [];
  for (const [mapping, cells] of [
    ['raster', rasterWindow],
    ['guide', guideWindow],
  ] as const) {
    if (!cells)
      diagnostics.push(
        Object.freeze({
          code: 'resource_limit',
          mapping,
          message: `Geometry window exceeds ${COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping} ${mapping} cells`,
        }),
      );
    else {
      const intervals = conflict(cells);
      if (intervals)
        diagnostics.push(
          Object.freeze({
            code: 'ambiguous_geometry',
            mapping,
            intervals,
            message: 'Mapped cells in the same consumer window cannot be separated',
          }),
        );
    }
  }
  if (diagnostics.length) return Object.freeze({ ok: false, diagnostics: Object.freeze(diagnostics) });
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      scope: 'local-geometry',
      source: Object.freeze({ raster, guide, bandPartition }),
      interval: Object.freeze({ sStart, sEnd }),
      cells: Object.freeze({ raster: rasterWindow!.length, guide: guideWindow!.length }),
    }),
  });
}
