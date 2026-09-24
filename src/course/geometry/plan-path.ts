import { clamp, normalFromHeading, tangentFromHeading, wrapAngle, type Vec2 } from '../../core/math.js';
import type { Writable } from '../../core/writable.js';
/** Derived geometry only; never part of the saved course schema. */
export type PlanSegmentGeometry =
  | { readonly kind: 'straight'; readonly length: number }
  | { readonly kind: 'arc'; readonly radius: number; readonly turn: number };

const TAU = Math.PI * 2;
// Metres: plan evaluation/endpoint arithmetic budget, about 86 ulps at 10^6 m.
// Shared with conservative plan-domain separation; does not widen point ownership.
export const PLAN_POSITION_TOLERANCE_METERS = 1e-8;
// Dimensionless: conservative relative padding of computed extrema (1 cm at 10^6 m).
// Covers trig/extremum evaluation roundoff; distinct from absolute sample admission.
const PLAN_BOUNDS_RELATIVE_PADDING = 1e-8;
// Metres: 1 nm radial ambiguity budget (about eight ulps at 10^6 m); subtracting the
// arc center loses direction here, so projection chooses the interval midpoint.
const ARC_CENTER_TOLERANCE_METERS = 1e-9;

export interface CompiledPlanSegment {
  readonly index: number;
  readonly geometry: PlanSegmentGeometry;
  readonly sStart: number;
  readonly sEnd: number;
  readonly start: Readonly<{ x: number; z: number; heading: number }>;
  readonly curvature: number;
  readonly center: Readonly<Vec2> | null;
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
    let center: Readonly<Vec2> | null = null;
    if (shape.kind === 'straight') {
      length = shape.length;
      const tangent = tangentFromHeading(heading);
      x += tangent.x * length;
      z += tangent.z * length;
    } else {
      const turn = shape.turn * (Math.PI / 180);
      const sign = Math.sign(turn);
      length = shape.radius * Math.abs(turn);
      curvature = sign / shape.radius;
      const normal = normalFromHeading(heading);
      center = Object.freeze({
        x: x + sign * shape.radius * normal.x,
        z: z + sign * shape.radius * normal.z,
      });
      heading = wrapAngle(heading + turn);
      x = center.x - sign * shape.radius * Math.cos(heading);
      z = center.z + sign * shape.radius * Math.sin(heading);
    }
    const sStart = s;
    s += length;
    if (![x, z, heading, s].every(Number.isFinite)) throw new RangeError('plan path must remain finite');
    return Object.freeze({
      index,
      geometry: Object.freeze({ ...shape }),
      sStart,
      sEnd: s,
      start: segmentStart,
      curvature,
      center,
    });
  });
  return Object.freeze({ segments: Object.freeze(segments), length: s });
}

function checkedPlanChainage(path: PlanPath, s: number): number {
  if (!Number.isFinite(s)) throw new RangeError('plan chainage must be finite');
  if (s < -PLAN_POSITION_TOLERANCE_METERS || s > path.length + PLAN_POSITION_TOLERANCE_METERS)
    throw new RangeError(`plan chainage ${s} is outside [0, ${path.length}]`);
  if (s <= 0) return 0;
  if (s >= path.length) return path.length;
  return s;
}

export function planSegmentIndexAt(path: PlanPath, s: number): number {
  const sLocal = checkedPlanChainage(path, s);
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

export function samplePlanSegment(
  segment: CompiledPlanSegment,
  s: number,
  out: Writable<PlanPathSample>,
): PlanPathSample {
  if (s < segment.sStart - PLAN_POSITION_TOLERANCE_METERS || s > segment.sEnd + PLAN_POSITION_TOLERANCE_METERS)
    throw new RangeError('plan segment sample is outside its interval');
  const clamped = clamp(s, segment.sStart, segment.sEnd);
  const ds = clamped - segment.sStart;
  let heading = segment.start.heading;
  if (segment.geometry.kind === 'straight') {
    const tangent = tangentFromHeading(heading);
    out.x = segment.start.x + tangent.x * ds;
    out.z = segment.start.z + tangent.z * ds;
  } else {
    const turn = segment.geometry.turn * (Math.PI / 180);
    const q = segment.sEnd === segment.sStart ? 0 : ds / (segment.sEnd - segment.sStart);
    heading = wrapAngle(heading + turn * q);
    const sign = Math.sign(turn);
    const center = segment.center;
    if (!center) throw new Error('compiled arc lost its center');
    out.x = center.x - sign * segment.geometry.radius * Math.cos(heading);
    out.z = center.z + sign * segment.geometry.radius * Math.sin(heading);
  }
  out.s = clamped;
  out.heading = heading;
  out.segmentIndex = segment.index;
  return out;
}

export function samplePlanPath(path: PlanPath, s: number, out: Writable<PlanPathSample>): PlanPathSample {
  const checked = checkedPlanChainage(path, s);
  return samplePlanSegment(path.segments[planSegmentIndexAt(path, checked)]!, checked, out);
}

function nearestArcDelta(rawHeading: number, startHeading: number, turn: number): number {
  const sign = Math.sign(turn);
  const extent = Math.abs(turn);
  const wrapped = wrapAngle(sign * (rawHeading - startHeading));
  const primary = wrapped < 0 ? wrapped + TAU : wrapped;
  const alternate = primary - TAU;
  const clippedPrimary = clamp(primary, 0, extent);
  const clippedAlternate = clamp(alternate, 0, extent);
  const primaryError = Math.abs(primary - clippedPrimary);
  const alternateError = Math.abs(alternate - clippedAlternate);
  return sign * (alternateError < primaryError ? alternate : primary);
}

export function projectPlanSegmentInterval(
  segment: CompiledPlanSegment,
  world: Vec2,
  start: number,
  end: number,
  out: Writable<PlanPathProjection>,
  sample: Writable<PlanPathSample>,
): PlanPathProjection {
  if (
    !world ||
    typeof world.x !== 'number' ||
    typeof world.z !== 'number' ||
    typeof start !== 'number' ||
    typeof end !== 'number'
  )
    throw new TypeError('plan projection requires numeric world coordinates and bounds');
  if (
    !Number.isFinite(world.x) ||
    !Number.isFinite(world.z) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < segment.sStart ||
    end > segment.sEnd ||
    !(end > start)
  )
    throw new RangeError('Projection interval must have positive extent inside its compiled segment');

  let rawS: number;
  if (segment.geometry.kind === 'straight') {
    const tangent = tangentFromHeading(segment.start.heading);
    const along = (world.x - segment.start.x) * tangent.x + (world.z - segment.start.z) * tangent.z;
    rawS = segment.sStart + along;
  } else {
    const center = segment.center;
    if (!center) throw new Error('compiled arc lost its center');
    const radialX = world.x - center.x;
    const radialZ = world.z - center.z;
    const radialLength = Math.hypot(radialX, radialZ);
    let q: number;
    if (radialLength < ARC_CENTER_TOLERANCE_METERS) {
      q = ((start + end) * 0.5 - segment.sStart) / (segment.sEnd - segment.sStart);
    } else {
      const sign = Math.sign(segment.geometry.turn);
      const rawHeading = Math.atan2(sign * radialZ, -sign * radialX);
      const turn = segment.geometry.turn * (Math.PI / 180);
      const delta = nearestArcDelta(rawHeading, segment.start.heading, turn);
      q = turn === 0 ? 0 : delta / turn;
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

export function planSegmentBounds(
  segment: CompiledPlanSegment,
  start: number,
  end: number,
  sampleA: Writable<PlanPathSample>,
  sampleB: Writable<PlanPathSample>,
) {
  const a = samplePlanSegment(segment, start, sampleA);
  const b = samplePlanSegment(segment, end, sampleB);
  let left = Math.min(a.x, b.x);
  let right = Math.max(a.x, b.x);
  let back = Math.min(a.z, b.z);
  let front = Math.max(a.z, b.z);
  if (segment.geometry.kind === 'arc') {
    const turn = segment.geometry.turn * (Math.PI / 180);
    const q0 = (start - segment.sStart) / (segment.sEnd - segment.sStart);
    const q1 = (end - segment.sStart) / (segment.sEnd - segment.sStart);
    const h0 = segment.start.heading + turn * q0;
    const h1 = segment.start.heading + turn * q1;
    const low = Math.min(h0, h1);
    const high = Math.max(h0, h1);
    const center = segment.center;
    if (!center) throw new Error('compiled arc lost its center');
    const sign = Math.sign(turn);
    const step = Math.PI / 2;
    for (let quadrant = Math.ceil(low / step); quadrant * step <= high; quadrant += 1) {
      const heading = quadrant * step;
      const x = center.x - sign * segment.geometry.radius * Math.cos(heading);
      const z = center.z + sign * segment.geometry.radius * Math.sin(heading);
      left = Math.min(left, x);
      right = Math.max(right, x);
      back = Math.min(back, z);
      front = Math.max(front, z);
    }
  }
  const padding =
    PLAN_BOUNDS_RELATIVE_PADDING * Math.max(1, Math.abs(left), Math.abs(right), Math.abs(back), Math.abs(front));
  return { left: left - padding, right: right + padding, back: back - padding, front: front + padding };
}
