import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import { normalFromHeading, tangentFromHeading, type Vec2 } from '../core/math.js';
import { profileIndexAt } from './geometry/open-profile.js';
import { rasterPathToWorld, type RasterPath } from './geometry/raster-path.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import { createPlanCoordinateSample, type SectionPlanCoordinateReader } from './geometry/plan-coordinate.js';
import type { CompiledPlanPrimitive } from './geometry/plan-path.js';
import { courseBoundaryAt, type CompiledRegionPartition, type CompiledBoundary } from './course-regions.js';

/** Work bound, not a distance guard or a promise that a product consumer fits. */
const COURSE_GEOMETRY_WINDOW_LIMITS = Object.freeze({ cellsPerMapping: 1024 });

interface GeometrySource {
  readonly raster: RasterPath;
  readonly coordinates: SectionPlanCoordinateReader;
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly regionPartition: CompiledRegionPartition;
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
  readonly mapping: 'raster' | 'plan';
  readonly message: string;
  readonly intervals?: readonly Interval[];
}
interface CompiledGeometryWindow {
  readonly scope: 'local-geometry';
  readonly source: GeometrySource;
  readonly interval: Interval;
  readonly cells: { readonly raster: number; readonly plan: number };
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
      const a = cells[i]!;
      const b = cells[j]!;
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

function boundaries(source: GeometrySource): readonly CompiledBoundary[] {
  return [...new Set(source.regionPartition.regions.flatMap((region) => [region.left, region.right]))];
}

function stations(source: GeometrySource, interval: Interval): number[] | null {
  const { raster, regionPartition, primitives } = source;
  const { sStart, sEnd } = interval;
  const values = new Set([sStart, sEnd]);
  const add = (s: number) => {
    if (s > sStart && s < sEnd) values.add(s);
  };
  const first = profileIndexAt(raster.segments, 'sStart', sStart);
  for (let i = first + 1; i < raster.segments.length && raster.segments[i]!.sStart < sEnd; i += 1)
    add(raster.segments[i]!.sStart);
  for (const boundary of boundaries(source)) for (const knot of boundary.knots) add(knot.anchor.s);
  for (const region of regionPartition.regions) {
    add(region.start.s);
    add(region.end.s);
  }
  for (const primitive of primitives) {
    add(primitive.sStart);
    add(primitive.sEnd);
  }
  if (values.size - 1 > COURSE_GEOMETRY_WINDOW_LIMITS.cellsPerMapping) return null;
  return [...values].sort((a, b) => a - b);
}

function rasterCells(source: GeometrySource, interval: Interval, sorted: readonly number[]): Cell[] {
  const { raster, regionPartition } = source;
  let index = profileIndexAt(raster.segments, 'sStart', interval.sStart);
  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1]!;
    while (index + 1 < raster.segments.length && raster.segments[index + 1]!.sStart <= start) index += 1;
    const regions = regionPartition.regions
      .filter((region) => region.start.s <= start && region.end.s >= end)
      .sort(
        (a, b) =>
          courseBoundaryAt(a.left, start) +
          courseBoundaryAt(a.left, end) -
          courseBoundaryAt(b.left, start) -
          courseBoundaryAt(b.left, end),
      );
    if (!regions.length) throw new Error('Admitted partition lost active coverage');
    const edge = (boundary: CompiledBoundary): Vec2[] => {
      const l0 = courseBoundaryAt(boundary, start);
      const l1 = courseBoundaryAt(boundary, end);
      const p = rasterPathToWorld(raster, start, l0, createPlanarCoordinateSample());
      const q = rasterPathToWorld(raster, end, l1, createPlanarCoordinateSample());
      const mid = rasterPathToWorld(raster, (start + end) / 2, (l0 + l1) / 2, createPlanarCoordinateSample());
      return [p, { x: 2 * mid.x - (p.x + q.x) / 2, z: 2 * mid.z - (p.z + q.z) / 2 }, q];
    };
    return cell(index, start, end, [...edge(regions[0]!.left), ...edge(regions.at(-1)!.right)]);
  });
}

function planCells(source: GeometrySource, sorted: readonly number[]): Cell[] {
  const lateralA = { left: 0, right: 0 };
  const lateralB = { left: 0, right: 0 };
  const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x;
  return sorted.slice(0, -1).map((start, i) => {
    const end = sorted[i + 1]!;
    const primitive = source.primitives.find((candidate) => candidate.sStart <= start && candidate.sEnd >= end);
    if (!primitive) throw new Error('Admitted plan cell crossed a primitive boundary');
    source.coordinates.domain.lateralAt(start, lateralA);
    source.coordinates.domain.lateralAt(end, lateralB);

    const edge = (lStart: number, lEnd: number): Vec2[] => {
      const a = source.coordinates.toWorld(start, lStart, createPlanCoordinateSample());
      const b = source.coordinates.toWorld(end, lEnd, createPlanCoordinateSample());
      const p = { x: a.x, z: a.z };
      const q = { x: b.x, z: b.z };
      if (primitive.curvature === 0) return [p, q];
      const slope = (lEnd - lStart) / (end - start);
      const derivative = (heading: number, l: number): Vec2 => {
        const tangent = tangentFromHeading(heading);
        const normal = normalFromHeading(heading);
        const metric = 1 - primitive.curvature * l;
        return { x: metric * tangent.x + slope * normal.x, z: metric * tangent.z + slope * normal.z };
      };
      const da = derivative(a.heading, lStart);
      const db = derivative(b.heading, lEnd);
      const denominator = cross(da, db);
      if (denominator === 0) throw new Error('Positive-metric circular plan edge lost tangent rotation');
      const delta = { x: q.x - p.x, z: q.z - p.z };
      const t = cross(delta, db) / denominator;
      return [p, { x: p.x + t * da.x, z: p.z + t * da.z }, q];
    };

    return cell(i, start, end, [...edge(lateralA.left, lateralB.left), ...edge(lateralA.right, lateralB.right)]);
  });
}

/**
 * Qualify one closed source-chainage window, not the Section as a geographic map. The caller owns
 * actual consumer coverage, occurrence/height selection and keeping all queries inside this window.
 */
export function compileCourseGeometryWindow(source: GeometrySource, interval: Interval): GeometryWindowResult {
  if (
    !source ||
    !source.raster ||
    !source.coordinates ||
    !Array.isArray(source.primitives) ||
    !source.regionPartition ||
    !Array.isArray(source.raster.segments) ||
    !Array.isArray(source.raster.vertexS) ||
    !source.regionPartition.raster ||
    !Array.isArray(source.regionPartition.regions) ||
    !interval ||
    typeof interval.sStart !== 'number' ||
    typeof interval.sEnd !== 'number'
  )
    throw new TypeError('Geometry window requires compiled reader facets and numeric interval endpoints');
  const { raster, coordinates, regionPartition } = source;
  const { sStart, sEnd } = interval;
  if (
    regionPartition.raster !== raster ||
    regionPartition.length !== raster.length ||
    coordinates.domain.start !== 0 ||
    coordinates.domain.end !== raster.length
  )
    throw new RangeError('Geometry window facets must share the canonical Section ruler');
  if (![sStart, sEnd].every(Number.isFinite) || sStart < 0 || sEnd > raster.length || !(sEnd > sStart))
    throw new RangeError('Geometry window must have positive extent inside the source ruler');
  const ruler = stations(source, interval);
  const rasterWindow = ruler ? rasterCells(source, interval, ruler) : null;
  const planWindow = ruler ? planCells(source, ruler) : null;
  const diagnostics: GeometryWindowDiagnostic[] = [];
  for (const [mapping, cells] of [
    ['raster', rasterWindow],
    ['plan', planWindow],
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
      source: Object.freeze({ raster, coordinates, primitives: source.primitives, regionPartition }),
      interval: Object.freeze({ sStart, sEnd }),
      cells: Object.freeze({ raster: rasterWindow!.length, plan: planWindow!.length }),
    }),
  });
}
