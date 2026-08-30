export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const VEC3_ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });
export const WORLD_UP: Vec3 = Object.freeze({ x: 0, y: 1, z: 0 });

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function magnitude3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize3(v: Vec3, fallback: Vec3 = WORLD_UP): Vec3 {
  const length = magnitude3(v);
  if (!(length > 1e-12) || !Number.isFinite(length)) return { ...fallback };
  return scale3(v, 1 / length);
}

export function projectOnPlane(v: Vec3, normal: Vec3): Vec3 {
  return sub3(v, scale3(normal, dot3(v, normal)));
}

export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const unit = normalize3(axis, { x: 1, y: 0, z: 0 });
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add3(
    add3(scale3(v, cosine), scale3(cross3(unit, v), sine)),
    scale3(unit, dot3(unit, v) * (1 - cosine)),
  );
}
