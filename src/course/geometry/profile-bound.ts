/**
 * The crests and dips rule ([Original road data](../../../docs/original-road-data.md#crests-and-dips)): a Section's
 * profile bounded in its vertical curvature, a crest's at most `crest` and a dip's at most `dip` (1/m), its heights the
 * nearest to the profile's that keep the bounds, its ends' heights and grades kept so that its seams still join.
 */
import { Profile, type ProfileKnot } from './profile.js';

/** The curvature bounds, 1/m: a crest's (the grade falling) and a dip's (rising); null leaves that side unbounded. */
export interface CurvatureBounds {
  readonly crest: number | null;
  readonly dip: number | null;
}

/** The nodes' spacing, about this many metres: a vertical curve this long at each, touching the next. */
const NODE = 1;
/** The solve: its penalty, its most rounds, and how near its bounds a curvature must come, 1/m. */
const RHO = 1e6;
const ROUNDS = 20000;
const CLOSE = 1e-8;

/** A node's three curves' coefficients: a curve at node i is (y[i−1] − 2 y[i] + y[i+1]) / c². */
const STENCIL = [
  [-1, 1],
  [0, -2],
  [1, 1],
] as const;

/**
 * The profile `knots` over `[0, length]`, its vertical curvature within `bounds`: unchanged where it already is (a kink,
 * a grade changing at once, is beyond any bound), and where no profile within them joins its ends; else heights at
 * nodes about `NODE` apart, each a vertical curve as long as their spacing, the nearest by least squares to the
 * profile's heights there whose curves keep the bounds, the first two and last two nodes held to keep the ends' heights
 * and grades. It is solved by alternating directions (ADMM) on the curves' second differences.
 */
export function boundProfile(
  knots: readonly ProfileKnot[],
  length: number,
  bounds: CurvatureBounds,
): readonly ProfileKnot[] {
  const [lower, upper] = [bounds.crest === null ? -Infinity : -bounds.crest, bounds.dip ?? Infinity];
  const grades = knots.slice(1).map((b, i) => (b.y - knots[i]!.y) / (b.s - knots[i]!.s));
  const within = knots.every((k, i) => {
    if (i === 0 || i === knots.length - 1) return true;
    const change = grades[i]! - grades[i - 1]!;
    if (change === 0) return true;
    if (k.curveLength === 0) return false;
    const curvature = change / k.curveLength;
    return curvature >= lower && curvature <= upper;
  });
  const n = Math.round(length / NODE);
  if (within || n < 5) return knots;

  const c = length / n;
  const original = new Profile(length, knots);
  const h = Float64Array.from({ length: n + 1 }, (_, i) =>
    i === 0 ? knots[0]!.y : i === n ? knots.at(-1)!.y : original.sample(i * c),
  );
  // Held: the ends' heights and the nodes one spacing in, on the ends' grades.
  const y = Float64Array.from(h);
  y[1] = h[0]! + grades[0]! * c;
  y[n - 1] = h[n]! - grades.at(-1)! * c;
  const solved = admm(y, h, c, lower, upper);
  if (!solved) return knots;
  const out: ProfileKnot[] = [{ s: 0, y: solved[0]!, curveLength: 0 }];
  for (let i = 1; i < n; i++) out.push({ s: i * c, y: solved[i]!, curveLength: c });
  out.push({ s: length, y: solved[n]!, curveLength: 0 });
  // Touching curves overlap by a rounding at most: each is shortened by what it overlaps the one before it.
  for (let i = 1; i < out.length; i++) {
    const [a, b] = [out[i - 1]!, out[i]!];
    const room = 2 * (b.s - a.s) - a.curveLength;
    if (b.curveLength > room) out[i] = { ...b, curveLength: Math.max(0, room) };
  }
  return out;
}

/**
 * The heights `y` (its first two and last two held) nearest to `h` whose second differences over `c²` lie within
 * `[lower, upper]`: min ½|y − h|² subject to D y = z, z in the box, by ADMM; null where it does not come within `CLOSE`.
 */
function admm(y: Float64Array, h: Float64Array, c: number, lower: number, upper: number): Float64Array | null {
  const n = y.length - 1;
  const m = n - 1; // curves at nodes 1..n−1
  const free = n - 3; // nodes 2..n−2
  const inv = 1 / (c * c);
  const held = (j: number) => j < 2 || j > n - 2;
  const d = (i: number) => (y[i - 1]! - 2 * y[i]! + y[i + 1]!) * inv;
  // I + ρ DᵀD on the free nodes, pentadiagonal: 1 + 6w on the diagonal, −4w and w off it.
  const w = RHO * inv * inv;
  const solve = factor(
    new Float64Array(free).fill(1 + 6 * w),
    new Float64Array(free).fill(-4 * w),
    new Float64Array(free).fill(w),
  );
  const z = new Float64Array(m + 2);
  const u = new Float64Array(m + 2);
  // Each curve's part from the held nodes, which never move.
  const fixed = new Float64Array(m + 2);
  for (let i = 1; i <= m; i++) {
    for (const [o, coef] of STENCIL) if (held(i + o)) fixed[i]! += coef * y[i + o]! * inv;
    z[i] = Math.min(upper, Math.max(lower, d(i)));
  }
  // t[i]: curve i's target less its held part; t[0] and t[m + 1] stay 0.
  const t = new Float64Array(m + 2);
  const rhs = new Float64Array(free);
  const ri = RHO * inv;
  for (let round = 0; round < ROUNDS; round++) {
    // y ← argmin ½|y − h|² + ρ/2 |D y − z + u|² over the free nodes: A y = h + ρ Dᵀ t.
    for (let i = 1; i <= m; i++) t[i] = z[i]! - u[i]! - fixed[i]!;
    for (let j = 2; j <= n - 2; j++) rhs[j - 2] = h[j]! + ri * (t[j - 1]! - 2 * t[j]! + t[j + 1]!);
    const next = solve(rhs);
    for (let k = 0; k < free; k++) y[k + 2] = next[k]!;
    let primal = 0;
    for (let i = 1; i <= m; i++) {
      const di = (y[i - 1]! - 2 * y[i]! + y[i + 1]!) * inv;
      const zi = Math.min(upper, Math.max(lower, di + u[i]!));
      u[i]! += di - zi;
      z[i] = zi;
      primal = Math.max(primal, Math.abs(di - zi));
    }
    if (primal <= CLOSE && round > 0) return y;
  }
  return null;
}

/** The solver of a symmetric pentadiagonal system, diagonal `a0`, first `a1` and second `a2` off it, factored LDLᵀ. */
function factor(a0: Float64Array, a1: Float64Array, a2: Float64Array) {
  const n = a0.length;
  const dd = new Float64Array(n),
    l1 = new Float64Array(n),
    l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = a0[i]!;
    if (i >= 1) v -= l1[i - 1]! * l1[i - 1]! * dd[i - 1]!;
    if (i >= 2) v -= l2[i - 2]! * l2[i - 2]! * dd[i - 2]!;
    dd[i] = v;
    if (i + 1 < n) l1[i] = (a1[i]! - (i >= 1 ? l2[i - 1]! * l1[i - 1]! * dd[i - 1]! : 0)) / v;
    if (i + 2 < n) l2[i] = a2[i]! / v;
  }
  return (b: Float64Array) => {
    const x = Float64Array.from(b);
    for (let i = 0; i < n; i++) {
      if (i >= 1) x[i]! -= l1[i - 1]! * x[i - 1]!;
      if (i >= 2) x[i]! -= l2[i - 2]! * x[i - 2]!;
    }
    for (let i = 0; i < n; i++) x[i]! /= dd[i]!;
    for (let i = n - 1; i >= 0; i--) {
      if (i + 1 < n) x[i]! -= l1[i]! * x[i + 1]!;
      if (i + 2 < n) x[i]! -= l2[i]! * x[i + 2]!;
    }
    return x;
  };
}
