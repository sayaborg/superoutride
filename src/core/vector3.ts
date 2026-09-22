import { type Writable } from './writable.js';
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const WORLD_UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });

export function add3(a: Vec3, b: Vec3, out: Writable<Vec3> = { x: 0, y: 0, z: 0 }): Writable<Vec3> {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub3(a: Vec3, b: Vec3, out: Writable<Vec3> = { x: 0, y: 0, z: 0 }): Writable<Vec3> {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale3(v: Vec3, scalar: number, out: Writable<Vec3> = { x: 0, y: 0, z: 0 }): Writable<Vec3> {
  out.x = v.x * scalar;
  out.y = v.y * scalar;
  out.z = v.z * scalar;
  return out;
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a: Vec3, b: Vec3, out: Writable<Vec3> = { x: 0, y: 0, z: 0 }): Writable<Vec3> {
  const x = a.y * b.z - a.z * b.y,
    y = a.z * b.x - a.x * b.z,
    z = a.x * b.y - a.y * b.x;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function magnitude3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize3(v: Vec3, out: Writable<Vec3> = { x: 0, y: 0, z: 0 }): Writable<Vec3> {
  const inverseLength = 1 / magnitude3(v);
  if (!(inverseLength > 0) || !Number.isFinite(inverseLength)) {
    throw new RangeError('normalization requires a finite representable inverse length');
  }
  return scale3(v, inverseLength, out);
}

export function rotateAroundAxis(
  v: Vec3,
  axis: Vec3,
  angle: number,
  out: Writable<Vec3> = { x: 0, y: 0, z: 0 },
): Writable<Vec3> {
  const inverseLength = 1 / magnitude3(axis);
  if (!(inverseLength > 0) || !Number.isFinite(inverseLength))
    throw new RangeError('normalization requires a finite representable inverse length');
  const unitX = axis.x * inverseLength,
    unitY = axis.y * inverseLength,
    unitZ = axis.z * inverseLength;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const factor = (unitX * v.x + unitY * v.y + unitZ * v.z) * (1 - cosine);
  const x = v.x * cosine + (unitY * v.z - unitZ * v.y) * sine + unitX * factor;
  const y = v.y * cosine + (unitZ * v.x - unitX * v.z) * sine + unitY * factor;
  const z = v.z * cosine + (unitX * v.y - unitY * v.x) * sine + unitZ * factor;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}
