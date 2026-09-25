const TAU = Math.PI * 2;

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapPositive(value: number, period: number): number {
  if (!(period > 0)) throw new RangeError('period must be > 0');
  const wrapped = value % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

// Normalize to (-period/2, +period/2].
function wrapSigned(delta: number, period: number): number {
  if (!(period > 0)) throw new RangeError('period must be > 0');
  const half = period * 0.5;
  let wrapped = wrapPositive(delta + half, period) - half;
  if (wrapped <= -half) wrapped = half;
  return wrapped;
}

export function wrapAngle(angle: number): number {
  return wrapSigned(angle, TAU);
}

export function tangentFromHeading(heading: number): Vec2 {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

export function normalFromHeading(heading: number): Vec2 {
  return { x: Math.cos(heading), z: -Math.sin(heading) };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, z: a.z - b.z };
}
