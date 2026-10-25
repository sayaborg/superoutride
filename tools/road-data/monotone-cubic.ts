/**
 * The join of a lateral the original changes straight between points ([Original road data](../../docs/original-road-data.md#a-lateral-changed-straight-between-points)):
 * one monotone cubic through the points (Fritsch–Carlson), level at an extremum, where one side is level, and at its
 * ends.
 */
import { requireInput } from '../course/authoring-io.js';
import { straightThrough } from './quadratic.js';

/**
 * The monotone cubic through knots `[position, value]`, positions strictly increasing: each interval a cubic Hermite
 * between its knots, a knot's slope the mean of its sides' (0 where they differ in sign or one is 0, and at the
 * ends), each interval's two slopes scaled together where they would let it overshoot (α² + β² ≤ 9). Level beyond the
 * ends.
 */
export function monotoneCubic(knots: readonly (readonly [number, number])[]): (position: number) => number {
  requireInput(knots.length > 0, '/knots', 'A join has at least one knot');
  const xs = knots.map(([p]) => p);
  const ys = knots.map(([, v]) => v);
  requireInput(
    xs.every((x, i) => i === 0 || x > xs[i - 1]!),
    '/knots',
    "A join's knots lie in increasing positions",
  );
  const n = knots.length;
  const delta = xs.slice(1).map((x, i) => (ys[i + 1]! - ys[i]!) / (x - xs[i]!));
  const m = xs.map((_, i) =>
    i === 0 || i === n - 1 || delta[i - 1]! * delta[i]! <= 0 ? 0 : (delta[i - 1]! + delta[i]!) / 2,
  );
  delta.forEach((d, i) => {
    if (d === 0) {
      m[i] = m[i + 1] = 0;
      return;
    }
    const [a, b] = [m[i]! / d, m[i + 1]! / d];
    const r = a * a + b * b;
    if (r > 9) {
      const tau = 3 / Math.sqrt(r);
      m[i] = tau * a * d;
      m[i + 1] = tau * b * d;
    }
  });
  return (p) => {
    if (p <= xs[0]!) return ys[0]!;
    if (p >= xs[n - 1]!) return ys[n - 1]!;
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= p) lo = mid;
      else hi = mid;
    }
    const h = xs[hi]! - xs[lo]!;
    const t = (p - xs[lo]!) / h;
    const [t2, t3] = [t * t, t * t * t];
    return (
      (2 * t3 - 3 * t2 + 1) * ys[lo]! +
      (t3 - 2 * t2 + t) * h * m[lo]! +
      (-2 * t3 + 3 * t2) * ys[hi]! +
      (t3 - t2) * h * m[hi]!
    );
  };
}

/**
 * A join written at `positions` (increasing): `curve`'s value at each, `offset` on, straight between them, as a road
 * width is written at its every position.
 */
export const writtenAt = (curve: (position: number) => number, positions: readonly number[], offset = 0) =>
  straightThrough(positions.map((p) => [p, curve(offset + p)] as const));
