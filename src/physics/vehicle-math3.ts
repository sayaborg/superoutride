export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Quaternion mapping body coordinates into world coordinates. */
export interface Quaternion {
  readonly w: number;
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

export function quaternionIdentity(): Quaternion {
  return { w: 1, x: 0, y: 0, z: 0 };
}

export function quaternionNormalize(q: Quaternion): Quaternion {
  const length = Math.hypot(q.w, q.x, q.y, q.z);
  if (!(length > 1e-12) || !Number.isFinite(length)) return quaternionIdentity();
  const inverse = 1 / length;
  return { w: q.w * inverse, x: q.x * inverse, y: q.y * inverse, z: q.z * inverse };
}

export function quaternionConjugate(q: Quaternion): Quaternion {
  return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
}

export function quaternionMultiply(a: Quaternion, b: Quaternion): Quaternion {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quaternionFromAxisAngle(axis: Vec3, angle: number): Quaternion {
  const unit = normalize3(axis, { x: 1, y: 0, z: 0 });
  const half = angle * 0.5;
  const s = Math.sin(half);
  return quaternionNormalize({
    w: Math.cos(half),
    x: unit.x * s,
    y: unit.y * s,
    z: unit.z * s,
  });
}

/** +yaw turns +Z toward +X. +pitch raises the nose. +lean means lean to vehicle right. */
export function quaternionFromYawPitchLean(yaw: number, pitch: number, lean: number): Quaternion {
  const qYaw = quaternionFromAxisAngle(WORLD_UP, yaw);
  const qPitch = quaternionFromAxisAngle({ x: 1, y: 0, z: 0 }, -pitch);
  const qLean = quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, -lean);
  return quaternionNormalize(quaternionMultiply(qYaw, quaternionMultiply(qPitch, qLean)));
}

export function rotateVector(qInput: Quaternion, v: Vec3): Vec3 {
  const q = quaternionNormalize(qInput);
  const p: Quaternion = { w: 0, x: v.x, y: v.y, z: v.z };
  const rotated = quaternionMultiply(quaternionMultiply(q, p), quaternionConjugate(q));
  return { x: rotated.x, y: rotated.y, z: rotated.z };
}

export function inverseRotateVector(q: Quaternion, v: Vec3): Vec3 {
  return rotateVector(quaternionConjugate(quaternionNormalize(q)), v);
}

export function quaternionFromRotationVector(rotation: Vec3): Quaternion {
  const angle = magnitude3(rotation);
  if (angle < 1e-12) {
    return quaternionNormalize({
      w: 1,
      x: rotation.x * 0.5,
      y: rotation.y * 0.5,
      z: rotation.z * 0.5,
    });
  }
  return quaternionFromAxisAngle(scale3(rotation, 1 / angle), angle);
}

export function integrateQuaternionBody(
  q: Quaternion,
  omegaBody: Vec3,
  dt: number,
): Quaternion {
  const delta = quaternionFromRotationVector(scale3(omegaBody, dt));
  return quaternionNormalize(quaternionMultiply(q, delta));
}

export function bodyBasisFromQuaternion(q: Quaternion): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
} {
  return {
    right: normalize3(rotateVector(q, { x: 1, y: 0, z: 0 }), { x: 1, y: 0, z: 0 }),
    up: normalize3(rotateVector(q, { x: 0, y: 1, z: 0 }), WORLD_UP),
    forward: normalize3(rotateVector(q, { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 }),
  };
}

export function yawFromQuaternion(q: Quaternion): number {
  const forward = rotateVector(q, { x: 0, y: 0, z: 1 });
  return Math.atan2(forward.x, forward.z);
}

/** Surface-relative right lean. Positive means the motorcycle leans to its right. */
export function leanFromBasis(right: Vec3, up: Vec3, surfaceNormal: Vec3): number {
  return Math.atan2(-dot3(right, surfaceNormal), dot3(up, surfaceNormal));
}

export function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  return rotateVector(quaternionFromAxisAngle(axis, angle), v);
}
