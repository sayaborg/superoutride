import { clamp, normalFromHeading, tangentFromHeading, type Vec2 } from '../../core/math.js';
import type { Writable } from '../../core/writable.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../../core/tolerances.js';
import type { PlanPrimitive } from '../course-document.js';

const TAU = Math.PI * 2;
const ARC_CENTER_TOLERANCE_METERS = 1e-9;

export interface CompiledPlanPrimitive {
  readonly index: number;
  readonly source: PlanPrimitive;
  readonly sStart: number;
  readonly sEnd: number;
  readonly start: Readonly<{ x: number; z: number; heading: number }>;
  readonly curvature: number;
  readonly center: Readonly<Vec2> | null;
}

export interface PlanPath {
  readonly primitives: readonly CompiledPlanPrimitive[];
  readonly length: number;
}

export interface PlanPathSample extends Writable<Vec2> {
  s: number;
  heading: number;
  primitiveIndex: number;
}

export interface PlanPathProjection {
  s: number;
  l: number;
  primitiveIndex: number;
  distanceSquared: number;
}

export function compilePlanPath(
  start: Readonly<{ x: number; z: number; heading: number }>,
  sources: readonly PlanPrimitive[],
): PlanPath {
  let x = start.x;
  let z = start.z;
  let heading = start.heading;
  let s = 0;
  const primitives = sources.map((source, index): CompiledPlanPrimitive => {
    const primitiveStart = Object.freeze({ x, z, heading });
    let length: number;
    let curvature = 0;
    let center: Readonly<Vec2> | null = null;
    if (source.kind === 'straight') {
      length = source.length;
      const tangent = tangentFromHeading(heading);
      x += tangent.x * length;
      z += tangent.z * length;
    } else {
      const turn = source.turn * (Math.PI / 180);
      const sign = Math.sign(turn);
      length = source.radius * Math.abs(turn);
      curvature = sign / source.radius;
      const normal = normalFromHeading(heading);
      center = Object.freeze({
        x: x + sign * source.radius * normal.x,
        z: z + sign * source.radius * normal.z,
      });
      heading += turn;
      x = center.x - sign * source.radius * Math.cos(heading);
      z = center.z + sign * source.radius * Math.sin(heading);
    }
    const sStart = s;
    s += length;
    if (![x, z, heading, s].every(Number.isFinite)) throw new RangeError('plan path must remain finite');
    return Object.freeze({
      index,
      source,
      sStart,
      sEnd: s,
      start: primitiveStart,
      curvature,
      center,
    });
  });
  return Object.freeze({ primitives: Object.freeze(primitives), length: s });
}

function checkedPlanChainage(path: PlanPath, s: number): number {
  if (!Number.isFinite(s)) throw new RangeError('plan chainage must be finite');
  if (s < -GEOMETRY_SAMPLING_TOLERANCE_METERS || s > path.length + GEOMETRY_SAMPLING_TOLERANCE_METERS)
    throw new RangeError(`plan chainage ${s} is outside [0, ${path.length}]`);
  if (s <= 0) return 0;
  if (s >= path.length) return path.length;
  return s;
}

export function planPrimitiveIndexAt(path: PlanPath, s: number): number {
  const sLocal = checkedPlanChainage(path, s);
  let low = 0;
  let high = path.primitives.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const primitive = path.primitives[mid]!;
    if (sLocal < primitive.sStart) high = mid - 1;
    else if (sLocal >= primitive.sEnd && mid < path.primitives.length - 1) low = mid + 1;
    else return mid;
  }
  return path.primitives.length - 1;
}

export function samplePlanPrimitive(
  primitive: CompiledPlanPrimitive,
  s: number,
  out: Writable<PlanPathSample>,
): PlanPathSample {
  if (s < primitive.sStart - GEOMETRY_SAMPLING_TOLERANCE_METERS || s > primitive.sEnd + GEOMETRY_SAMPLING_TOLERANCE_METERS)
    throw new RangeError('plan primitive sample is outside its interval');
  const clamped = clamp(s, primitive.sStart, primitive.sEnd);
  const ds = clamped - primitive.sStart;
  let heading = primitive.start.heading;
  if (primitive.source.kind === 'straight') {
    const tangent = tangentFromHeading(heading);
    out.x = primitive.start.x + tangent.x * ds;
    out.z = primitive.start.z + tangent.z * ds;
  } else {
    const turn = primitive.source.turn * (Math.PI / 180);
    const q = primitive.sEnd === primitive.sStart ? 0 : ds / (primitive.sEnd - primitive.sStart);
    heading += turn * q;
    const sign = Math.sign(turn);
    const center = primitive.center;
    if (!center) throw new Error('compiled arc lost its center');
    out.x = center.x - sign * primitive.source.radius * Math.cos(heading);
    out.z = center.z + sign * primitive.source.radius * Math.sin(heading);
  }
  out.s = clamped;
  out.heading = heading;
  out.primitiveIndex = primitive.index;
  return out;
}

export function samplePlanPath(path: PlanPath, s: number, out: Writable<PlanPathSample>): PlanPathSample {
  const checked = checkedPlanChainage(path, s);
  return samplePlanPrimitive(path.primitives[planPrimitiveIndexAt(path, checked)]!, checked, out);
}

function nearestArcDelta(rawHeading: number, startHeading: number, turn: number): number {
  const minimum = Math.min(0, turn);
  const maximum = Math.max(0, turn);
  let best = clamp(rawHeading - startHeading, minimum, maximum);
  let bestError = Infinity;
  for (let winding = -2; winding <= 2; winding += 1) {
    const candidate = rawHeading - startHeading + winding * TAU;
    const clipped = clamp(candidate, minimum, maximum);
    const error = Math.abs(candidate - clipped);
    if (error < bestError || (error === bestError && Math.abs(clipped) < Math.abs(best))) {
      best = clipped;
      bestError = error;
    }
  }
  return best;
}

export function projectPlanPrimitiveInterval(
  primitive: CompiledPlanPrimitive,
  world: Vec2,
  start: number,
  end: number,
  out: Writable<PlanPathProjection>,
  sample: Writable<PlanPathSample>,
): PlanPathProjection {
  if (!world || typeof world.x !== 'number' || typeof world.z !== 'number' || typeof start !== 'number' || typeof end !== 'number')
    throw new TypeError('plan projection requires numeric world coordinates and bounds');
  if (
    !Number.isFinite(world.x) ||
    !Number.isFinite(world.z) ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < primitive.sStart ||
    end > primitive.sEnd ||
    !(end > start)
  )
    throw new RangeError('Projection interval must have positive extent inside its source primitive');

  let s: number;
  if (primitive.source.kind === 'straight') {
    const tangent = tangentFromHeading(primitive.start.heading);
    const along = (world.x - primitive.start.x) * tangent.x + (world.z - primitive.start.z) * tangent.z;
    s = clamp(primitive.sStart + along, start, end);
  } else {
    const center = primitive.center;
    if (!center) throw new Error('compiled arc lost its center');
    const radialX = world.x - center.x;
    const radialZ = world.z - center.z;
    const radialLength = Math.hypot(radialX, radialZ);
    let q: number;
    if (radialLength < ARC_CENTER_TOLERANCE_METERS) {
      q = ((start + end) * 0.5 - primitive.sStart) / (primitive.sEnd - primitive.sStart);
    } else {
      const sign = Math.sign(primitive.source.turn);
      const rawHeading = Math.atan2(sign * radialZ, -sign * radialX);
      const turn = primitive.source.turn * (Math.PI / 180);
      const delta = nearestArcDelta(rawHeading, primitive.start.heading, turn);
      q = turn === 0 ? 0 : delta / turn;
    }
    s = clamp(primitive.sStart + q * (primitive.sEnd - primitive.sStart), start, end);
  }

  samplePlanPrimitive(primitive, s, sample);
  const dx = world.x - sample.x;
  const dz = world.z - sample.z;
  const normal = normalFromHeading(sample.heading);
  out.s = sample.s;
  out.l = dx * normal.x + dz * normal.z;
  out.primitiveIndex = primitive.index;
  out.distanceSquared = dx * dx + dz * dz;
  return out;
}

export function planPrimitiveBounds(
  primitive: CompiledPlanPrimitive,
  start: number,
  end: number,
  sampleA: Writable<PlanPathSample>,
  sampleB: Writable<PlanPathSample>,
) {
  const a = samplePlanPrimitive(primitive, start, sampleA);
  const b = samplePlanPrimitive(primitive, end, sampleB);
  let left = Math.min(a.x, b.x);
  let right = Math.max(a.x, b.x);
  let back = Math.min(a.z, b.z);
  let front = Math.max(a.z, b.z);
  if (primitive.source.kind === 'arc') {
    const turn = primitive.source.turn * (Math.PI / 180);
    const q0 = (start - primitive.sStart) / (primitive.sEnd - primitive.sStart);
    const q1 = (end - primitive.sStart) / (primitive.sEnd - primitive.sStart);
    const h0 = primitive.start.heading + turn * q0;
    const h1 = primitive.start.heading + turn * q1;
    const low = Math.min(h0, h1);
    const high = Math.max(h0, h1);
    const center = primitive.center;
    if (!center) throw new Error('compiled arc lost its center');
    const sign = Math.sign(turn);
    const step = Math.PI / 2;
    for (let quadrant = Math.ceil(low / step); quadrant * step <= high; quadrant += 1) {
      const heading = quadrant * step;
      const x = center.x - sign * primitive.source.radius * Math.cos(heading);
      const z = center.z + sign * primitive.source.radius * Math.sin(heading);
      left = Math.min(left, x);
      right = Math.max(right, x);
      back = Math.min(back, z);
      front = Math.max(front, z);
    }
  }
  const padding =
    GEOMETRY_SAMPLING_TOLERANCE_METERS * Math.max(1, Math.abs(left), Math.abs(right), Math.abs(back), Math.abs(front));
  return { left: left - padding, right: right + padding, back: back - padding, front: front + padding };
}
