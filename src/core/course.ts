import { headingFromDelta, normalFromHeading, tangentFromHeading, wrapAngle, type Vec2 } from './math.js';

export interface RasterVertex extends Vec2 {
  // Optional editor/compiler metadata from Core §14.
  sourceRadius?: number;
}

export interface RasterSegment {
  index: number;
  startVertexIndex: number;
  endVertexIndex: number;
  sStart: number;
  length: number;
  heading: number;
}

/**
 * Core geometry primitive.
 *
 * A RasterPath is always open: P0 -> P1 -> ... -> Pn.  Topology such as a
 * circuit seam or a point-to-point stage graph is deliberately not encoded in
 * this object.
 */
export interface RasterPath {
  readonly vertices: readonly Readonly<RasterVertex>[];
  readonly segments: readonly Readonly<RasterSegment>[];
  readonly vertexS: readonly number[];
  readonly vertexTurns: readonly number[];
  /**
   * Per-vertex lateral basis for exact miter joins. Multiplying this vector by
   * l yields the shared intersection of adjacent offset lines at an interior
   * vertex. Endpoints use the normal of their single adjacent segment.
   */
  readonly vertexMiters: readonly Readonly<Vec2>[];
  readonly length: number;
}

export interface RasterSample extends Vec2 {
  s: number;
  segmentIndex: number;
  heading: number;
}

export interface CourseWorldSample extends RasterSample {
  l: number;
}

const MAX_VERTEX_TURN = (10 * Math.PI) / 180;
const EPSILON = 1e-9;
const SAMPLING_TOLERANCE = 1e-8;

export function compileRasterPath(vertices: readonly RasterVertex[]): RasterPath {
  if (vertices.length < 2) throw new Error('open raster path requires at least 2 vertices');

  const copied = vertices.map((vertex) => {
    if (![vertex.x, vertex.z].every(Number.isFinite)) {
      throw new RangeError('raster vertex coordinates must be finite');
    }
    if (vertex.sourceRadius !== undefined && (!(vertex.sourceRadius > 0) || !Number.isFinite(vertex.sourceRadius))) {
      throw new RangeError('raster vertex sourceRadius must be finite and > 0');
    }
    return Object.freeze({ ...vertex });
  });
  const segments: RasterSegment[] = [];
  const vertexS: number[] = new Array(copied.length).fill(0);

  let s = 0;
  for (let i = 0; i < copied.length - 1; i += 1) {
    const start = copied[i]!;
    const end = copied[i + 1]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || !Number.isFinite(s + length)) {
      throw new RangeError('raster path length must be finite');
    }
    if (!(length > EPSILON)) throw new Error(`raster segment ${i} has zero length`);

    vertexS[i] = s;
    segments.push({
      index: i,
      startVertexIndex: i,
      endVertexIndex: i + 1,
      sStart: s,
      length,
      heading: headingFromDelta(dx, dz),
    });
    s += length;
  }
  vertexS[copied.length - 1] = s;

  const vertexTurns = copied.map((_, i) => {
    if (i === 0 || i === copied.length - 1) return 0;
    const incoming = segments[i - 1]!.heading;
    const outgoing = segments[i]!.heading;
    const turn = wrapAngle(outgoing - incoming);
    if (Math.abs(turn) > MAX_VERTEX_TURN + 1e-8) {
      throw new Error(
        `raster vertex ${i} turn ${((Math.abs(turn) * 180) / Math.PI).toFixed(4)}deg exceeds Core 10deg limit`,
      );
    }
    return turn;
  });

  const vertexMiters = copied.map((_, i) => {
    if (i === 0) return normalFromHeading(segments[0]!.heading);
    if (i === copied.length - 1) return normalFromHeading(segments[segments.length - 1]!.heading);

    const incoming = segments[i - 1]!.heading;
    const outgoing = segments[i]!.heading;
    const nIn = normalFromHeading(incoming);
    const nOut = normalFromHeading(outgoing);
    const denominator = 1 + nIn.x * nOut.x + nIn.z * nOut.z;
    if (!(denominator > EPSILON)) {
      throw new Error(`raster vertex ${i} has degenerate lateral miter`);
    }
    return {
      x: (nIn.x + nOut.x) / denominator,
      z: (nIn.z + nOut.z) / denominator,
    };
  });

  return Object.freeze({
    vertices: Object.freeze(copied),
    segments: Object.freeze(segments.map((segment) => Object.freeze(segment))),
    vertexS: Object.freeze(vertexS),
    vertexTurns: Object.freeze(vertexTurns),
    vertexMiters: Object.freeze(vertexMiters.map((miter) => Object.freeze(miter))),
    length: s,
  });
}

export function sampleRasterPath(path: RasterPath, s: number): RasterSample {
  const sLocal = checkedPathChainage(path, s);
  const segmentIndex = findRasterSegmentIndex(path, sLocal);
  const segment = path.segments[segmentIndex]!;
  const start = path.vertices[segment.startVertexIndex]!;
  const tangent = tangentFromHeading(segment.heading);
  const ds = sLocal - segment.sStart;

  return {
    x: start.x + tangent.x * ds,
    z: start.z + tangent.z * ds,
    s: sLocal,
    segmentIndex,
    heading: segment.heading,
  };
}

/**
 * Map raster chainage/lateral coordinates into world space with exact C0 miter
 * joins for every fixed-l strip edge.
 *
 * The centerline, chainage and segment headings remain unchanged. Only the
 * lateral basis changes. Each interior vertex basis is the intersection per
 * metre of the adjacent offset lines; endpoints use their adjacent segment
 * normal. Linear interpolation between endpoint bases remains on the current
 * segment's offset line.
 */
export function rasterPathToWorld(path: RasterPath, s: number, l: number): CourseWorldSample {
  if (!Number.isFinite(l)) throw new RangeError('raster lateral coordinate must be finite');
  const center = sampleRasterPath(path, s);
  const segment = path.segments[center.segmentIndex]!;
  const ds = center.s - segment.sStart;
  const t = Math.max(0, Math.min(1, ds / segment.length));
  const m0 = path.vertexMiters[segment.startVertexIndex]!;
  const m1 = path.vertexMiters[segment.endVertexIndex]!;
  const lateralX = m0.x + (m1.x - m0.x) * t;
  const lateralZ = m0.z + (m1.z - m0.z) * t;

  return {
    ...center,
    x: center.x + lateralX * l,
    z: center.z + lateralZ * l,
    l,
  };
}

function checkedPathChainage(path: RasterPath, s: number): number {
  if (!Number.isFinite(s)) throw new RangeError('raster path chainage must be finite');
  if (s < -SAMPLING_TOLERANCE || s > path.length + SAMPLING_TOLERANCE) {
    throw new RangeError(`raster path chainage ${s} is outside [0, ${path.length}]`);
  }
  if (s <= 0) return 0;
  if (s >= path.length) return path.length;
  return s;
}

function findRasterSegmentIndex(path: RasterPath, sLocal: number): number {
  let low = 0;
  let high = path.segments.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = path.segments[mid]!;
    const nextStart = segment.sStart + segment.length;
    if (sLocal < segment.sStart) {
      high = mid - 1;
    } else if (sLocal >= nextStart && mid < path.segments.length - 1) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return path.segments.length - 1;
}
