import {
  headingFromDelta,
  normalFromHeading,
  tangentFromHeading,
  wrapAngle,
  wrapPositive,
  type Vec2,
} from './math.js';

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

export interface RasterCourse {
  vertices: readonly RasterVertex[];
  segments: readonly RasterSegment[];
  vertexS: readonly number[];
  vertexTurns: readonly number[];
  /**
   * Per-vertex lateral basis for exact miter joins. Multiplying this vector by
   * l yields the shared intersection of the incoming/outgoing offset lines.
   */
  vertexMiters: readonly Vec2[];
  length: number;
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

export function compileRasterCourse(vertices: readonly RasterVertex[]): RasterCourse {
  if (vertices.length < 3) throw new Error('closed raster course requires at least 3 vertices');

  const copied = vertices.map((vertex) => ({ ...vertex }));
  const segments: RasterSegment[] = [];
  const vertexS: number[] = new Array(copied.length).fill(0);

  let s = 0;
  for (let i = 0; i < copied.length; i += 1) {
    const start = copied[i]!;
    const end = copied[(i + 1) % copied.length]!;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (!(length > EPSILON)) throw new Error(`raster segment ${i} has zero length`);

    vertexS[i] = s;
    segments.push({
      index: i,
      startVertexIndex: i,
      endVertexIndex: (i + 1) % copied.length,
      sStart: s,
      length,
      heading: headingFromDelta(dx, dz),
    });
    s += length;
  }

  const vertexTurns = copied.map((_, i) => {
    const incoming = segments[(i - 1 + segments.length) % segments.length]!.heading;
    const outgoing = segments[i]!.heading;
    const turn = wrapAngle(outgoing - incoming);
    if (Math.abs(turn) > MAX_VERTEX_TURN + 1e-8) {
      throw new Error(
        `raster vertex ${i} turn ${(Math.abs(turn) * 180 / Math.PI).toFixed(4)}deg exceeds Core 10deg limit`,
      );
    }
    return turn;
  });

  const vertexMiters = copied.map((_, i) => {
    const incoming = segments[(i - 1 + segments.length) % segments.length]!.heading;
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

  return {
    vertices: copied,
    segments,
    vertexS,
    vertexTurns,
    vertexMiters,
    length: s,
  };
}

export function sampleRasterCourse(course: RasterCourse, s: number): RasterSample {
  const sLocal = wrapPositive(s, course.length);
  const segmentIndex = findRasterSegmentIndex(course, sLocal);
  const segment = course.segments[segmentIndex]!;
  const start = course.vertices[segment.startVertexIndex]!;
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
 * lateral basis changes. Each vertex basis is the intersection per metre of
 * the adjacent offset lines; linear interpolation between the two endpoint
 * miters remains on the current segment's offset line. This removes the old
 * outside-corner step without introducing polygons, another road path or any
 * camera-space depth.
 */
export function rasterCourseToWorld(course: RasterCourse, s: number, l: number): CourseWorldSample {
  const center = sampleRasterCourse(course, s);
  const segment = course.segments[center.segmentIndex]!;
  const ds = center.s - segment.sStart;
  const t = Math.max(0, Math.min(1, ds / segment.length));
  const m0 = course.vertexMiters[segment.startVertexIndex]!;
  const m1 = course.vertexMiters[segment.endVertexIndex]!;
  const lateralX = m0.x + (m1.x - m0.x) * t;
  const lateralZ = m0.z + (m1.z - m0.z) * t;

  return {
    ...center,
    x: center.x + lateralX * l,
    z: center.z + lateralZ * l,
    l,
  };
}

function findRasterSegmentIndex(course: RasterCourse, sLocal: number): number {
  let low = 0;
  let high = course.segments.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = course.segments[mid]!;
    const nextStart = segment.sStart + segment.length;
    if (sLocal < segment.sStart) {
      high = mid - 1;
    } else if (sLocal >= nextStart && mid < course.segments.length - 1) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return course.segments.length - 1;
}
