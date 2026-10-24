import { clamp, normalFromHeading, tangentFromHeading, wrapAngle, type Vec2 } from '../../core/math.js';
import type { Writable } from '../../core/writable.js';
/** Derived geometry only; never part of the saved course schema. */
export type PlanSegmentGeometry =
  | { readonly kind: 'straight'; readonly length: number }
  | {
      readonly kind: 'arc';
      readonly radius: number;
      /** Signed deflection in radians. */
      readonly turn: number;
    };

const TAU = Math.PI * 2;
// Metres: plan evaluation/endpoint arithmetic budget, about 1,370 ulps at a Section's 43,000 m native extent.
// Shared with conservative plan-domain separation; does not widen point ownership.
export const PLAN_POSITION_TOLERANCE_METERS = 1e-8;
// Metres: 1 nm radial ambiguity budget (about 137 ulps at 43,000 m); at the arc's centre a point has no
// direction, so projection chooses the interval midpoint.
const ARC_CENTER_TOLERANCE_METERS = 1e-9;

export interface CompiledPlanSegment {
  readonly index: number;
  readonly geometry: PlanSegmentGeometry;
  readonly sStart: number;
  readonly sEnd: number;
  readonly start: Readonly<{ x: number; z: number; heading: number }>;
  readonly curvature: number;
}

export interface PlanPath {
  readonly segments: readonly CompiledPlanSegment[];
  readonly length: number;
}

export interface PlanPathSample extends Writable<Vec2> {
  s: number;
  heading: number;
  segmentIndex: number;
}

export interface PlanPathProjection {
  s: number;
  l: number;
  segmentIndex: number;
  distanceSquared: number;
  /** The perpendicular foot lies within the requested interval before endpoint clamping. */
  isFoot: boolean;
}

/**
 * The plan path of `geometry` laid from `start`: each segment's chainage, start pose, curvature and arc center. A trusted
 * transform that checks nothing itself. Its caller owns admission: course plans are admitted once by the course
 * compiler (`compileCourseGeometry`), which checks the PIs before this call (distinct points, radii, deflections,
 * non-overlapping tangents) and the result after it (every segment of positive representable length and finite
 * curvature, the ruler within the document limit). Other callers pass constant geometry.
 */
export function compilePlanPath(
  start: Readonly<{ x: number; z: number; heading: number }>,
  geometry: readonly PlanSegmentGeometry[],
): PlanPath {
  let x = start.x;
  let z = start.z;
  let heading = wrapAngle(start.heading);
  let s = 0;
  const segments = geometry.map((shape, index): CompiledPlanSegment => {
    const segmentStart = Object.freeze({ x, z, heading });
    let length: number;
    let curvature = 0;
    if (shape.kind === 'straight') {
      length = shape.length;
      const tangent = tangentFromHeading(heading);
      x += tangent.x * length;
      z += tangent.z * length;
    } else {
      length = shape.radius * Math.abs(shape.turn);
      curvature = Math.sign(shape.turn) / shape.radius;
      const end = arcPoint(segmentStart, shape.radius, shape.turn, 1);
      [x, z] = [end.x, end.z];
      heading = wrapAngle(heading + shape.turn);
    }
    const sStart = s;
    s += length;
    return Object.freeze({
      index,
      geometry: Object.freeze({ ...shape }),
      sStart,
      sEnd: s,
      start: segmentStart,
      curvature,
    });
  });
  return Object.freeze({ segments: Object.freeze(segments), length: s });
}

/**
 * The point a fraction `q` along an arc of `radius` turning `turn` from pose `start`, from the start alone: `R sin φ`
 * along the start's tangent and `2R sin²(φ/2)` toward its centre for the swept `φ`. No term subtracts the centre, so a
 * radius of any finite size keeps its points to the start's own precision.
 */
function arcPoint(start: Readonly<{ x: number; z: number; heading: number }>, radius: number, turn: number, q: number) {
  const tangent = tangentFromHeading(start.heading);
  const normal = normalFromHeading(start.heading);
  const swept = Math.abs(turn) * q;
  const along = radius * Math.sin(swept);
  const inward = Math.sign(turn) * 2 * radius * Math.sin(swept / 2) ** 2;
  return { x: start.x + tangent.x * along + normal.x * inward, z: start.z + tangent.z * along + normal.z * inward };
}

function normalizePlanChainage(path: PlanPath, s: number): number {
  if (s <= 0) return 0;
  if (s >= path.length) return path.length;
  return s;
}

export function planSegmentIndexAt(path: PlanPath, s: number): number {
  const sLocal = normalizePlanChainage(path, s);
  let low = 0;
  let high = path.segments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = path.segments[mid]!;
    if (sLocal < segment.sStart) high = mid - 1;
    else if (sLocal >= segment.sEnd && mid < path.segments.length - 1) low = mid + 1;
    else return mid;
  }
  return path.segments.length - 1;
}

function samplePlanSegment(segment: CompiledPlanSegment, s: number, out: Writable<PlanPathSample>): PlanPathSample {
  const clamped = clamp(s, segment.sStart, segment.sEnd);
  const ds = clamped - segment.sStart;
  let heading = segment.start.heading;
  if (segment.geometry.kind === 'straight') {
    const tangent = tangentFromHeading(heading);
    out.x = segment.start.x + tangent.x * ds;
    out.z = segment.start.z + tangent.z * ds;
  } else {
    const turn = segment.geometry.turn;
    const q = ds / (segment.sEnd - segment.sStart);
    heading = wrapAngle(heading + turn * q);
    const point = arcPoint(segment.start, segment.geometry.radius, turn, q);
    out.x = point.x;
    out.z = point.z;
  }
  out.s = clamped;
  out.heading = heading;
  out.segmentIndex = segment.index;
  return out;
}

export function samplePlanPath(path: PlanPath, s: number, out: Writable<PlanPathSample>): PlanPathSample {
  const checked = normalizePlanChainage(path, s);
  return samplePlanSegment(path.segments[planSegmentIndexAt(path, checked)]!, checked, out);
}

/** Of the swept angles `φ` and `φ − 2π` (φ in [0, 2π)), the one nearer the arc's sweep `[0, extent]`. */
function nearestSweep(swept: number, extent: number): number {
  const primary = swept < 0 ? swept + TAU : swept;
  const alternate = primary - TAU;
  const primaryError = Math.abs(primary - clamp(primary, 0, extent));
  const alternateError = Math.abs(alternate - clamp(alternate, 0, extent));
  return alternateError < primaryError ? alternate : primary;
}

export function projectPlanSegmentInterval(
  segment: CompiledPlanSegment,
  world: Vec2,
  start: number,
  end: number,
  out: Writable<PlanPathProjection>,
  sample: Writable<PlanPathSample>,
): PlanPathProjection {
  let rawS: number;
  if (segment.geometry.kind === 'straight') {
    const tangent = tangentFromHeading(segment.start.heading);
    const along = (world.x - segment.start.x) * tangent.x + (world.z - segment.start.z) * tangent.z;
    rawS = segment.sStart + along;
  } else {
    // The point in the start's frame, `along` its tangent and `inward` toward the centre, scaled by the curvature: its
    // sweep about the centre is atan2(k·along, 1 − k·inward), and its distance from the centre R·hypot of the two.
    const tangent = tangentFromHeading(segment.start.heading);
    const normal = normalFromHeading(segment.start.heading);
    const [dx, dz] = [world.x - segment.start.x, world.z - segment.start.z];
    const k = 1 / segment.geometry.radius;
    const along = k * (dx * tangent.x + dz * tangent.z);
    const inward = 1 - k * Math.sign(segment.geometry.turn) * (dx * normal.x + dz * normal.z);
    let q: number;
    if (Math.hypot(along, inward) * segment.geometry.radius < ARC_CENTER_TOLERANCE_METERS) {
      q = ((start + end) * 0.5 - segment.sStart) / (segment.sEnd - segment.sStart);
    } else {
      const extent = Math.abs(segment.geometry.turn);
      q = nearestSweep(Math.atan2(along, inward), extent) / extent;
    }
    rawS = segment.sStart + q * (segment.sEnd - segment.sStart);
  }

  const s = clamp(rawS, start, end);
  samplePlanSegment(segment, s, sample);
  const dx = world.x - sample.x;
  const dz = world.z - sample.z;
  const normal = normalFromHeading(sample.heading);
  out.s = sample.s;
  out.l = dx * normal.x + dz * normal.z;
  out.segmentIndex = segment.index;
  out.distanceSquared = dx * dx + dz * dz;
  out.isFoot = rawS >= start && rawS <= end;
  return out;
}
