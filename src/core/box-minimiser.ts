/**
 * A minimiser of a smooth cost over a box, every variable within [lower, upper] (the grades' rule's solve, [Original
 * road data](../../docs/original-road-data.md#profile-from-the-originals-screen), among its users): the two-metric
 * projection method (Bertsekas 1982) with a limited-memory quasi-Newton metric on the free variables. Each iteration
 * holds the variables at a bound that the gradient pushes outward (within ε of it, ε the projected step's size), steps
 * the others by the quasi-Newton direction the remembered corrections give and the held ones by the steepest descent,
 * and halves the step along the projection arc until the cost falls enough (Armijo's rule).
 */

/** The cost and its gradient at x. */
export type CostWithGradient = (x: Float64Array) => { readonly cost: number; readonly gradient: Float64Array };

/** When the minimiser stops and how much it remembers. */
export interface BoxOptions {
  readonly lower: number;
  readonly upper: number;
  /** Iterations, and cost evaluations (checked after each iteration). */
  readonly iterations: number;
  readonly evaluations: number;
  /** Stop when the cost falls by at most this relative to max(|cost|, 1) in an iteration. */
  readonly costTolerance: number;
  /** Stop when the projected gradient's largest component is at most this. */
  readonly gradientTolerance: number;
  /** The corrections remembered. */
  readonly memory: number;
}

/** Armijo's sufficient decrease, and the halvings of a step before the direction is given up for the gradient's. */
const SUFFICIENT = 1e-4;
const HALVINGS = 40;
/** The largest ε of the held set: a variable this near a bound, its gradient pushing outward, is held. */
const NEAR = 1e-3;
/** A correction is remembered only where its curvature sᵀy exceeds this share of yᵀy. */
const CURVATURE = 1e-10;

/** The sum of a[i] b[i]. */
function dot(a: Float64Array, b: Float64Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** The remembered corrections s = x' − x and y = g' − g, oldest first. */
interface Corrections {
  readonly s: Float64Array[];
  readonly y: Float64Array[];
}

/**
 * The quasi-Newton direction −H q on the free variables (the held ones' components taken as 0) by the corrections'
 * two loops, H₀ the scalar sᵀy / yᵀy of the newest.
 */
function quasiNewton(q: Float64Array, free: Uint8Array, memory: Corrections): Float64Array {
  const r = Float64Array.from(q, (v, i) => (free[i] ? v : 0));
  const masked = (v: Float64Array) => Float64Array.from(v, (x, i) => (free[i] ? x : 0));
  const pairs = memory.s.map((s, k) => ({ s: masked(s), y: masked(memory.y[k]!) }));
  const rho = pairs.map(({ s, y }) => dot(s, y));
  const alpha = new Float64Array(pairs.length);
  for (let k = pairs.length - 1; k >= 0; k--) {
    if (rho[k]! <= 0) continue;
    alpha[k] = dot(pairs[k]!.s, r) / rho[k]!;
    for (let i = 0; i < r.length; i++) r[i]! -= alpha[k]! * pairs[k]!.y[i]!;
  }
  let newest = pairs.length - 1;
  while (newest >= 0 && rho[newest]! <= 0) newest--;
  const scale = newest < 0 ? 1 : rho[newest]! / dot(pairs[newest]!.y, pairs[newest]!.y);
  for (let i = 0; i < r.length; i++) r[i]! *= scale;
  for (let k = 0; k < pairs.length; k++) {
    if (rho[k]! <= 0) continue;
    const beta = dot(pairs[k]!.y, r) / rho[k]!;
    for (let i = 0; i < r.length; i++) r[i]! += (alpha[k]! - beta) * pairs[k]!.s[i]!;
  }
  return r.map((v) => -v);
}

/** The minimiser of `cost` from `x0` within [lower, upper] for every variable. */
export function minimiseInBox(cost: CostWithGradient, x0: Float64Array, options: BoxOptions): Float64Array {
  const { lower, upper } = options;
  const clamp = (v: number) => Math.min(upper, Math.max(lower, v));
  let x: Float64Array = Float64Array.from(x0, clamp);
  let at = cost(x);
  let evaluations = 1;
  const memory: Corrections = { s: [], y: [] };
  for (let iteration = 0; iteration < options.iterations && evaluations < options.evaluations; iteration++) {
    const g = at.gradient;
    // The projected gradient step's size, and the held set within ε of it.
    let size = 0;
    for (let i = 0; i < x.length; i++) size = Math.max(size, Math.abs(clamp(x[i]! - g[i]!) - x[i]!));
    if (size <= options.gradientTolerance) break;
    const near = Math.min(NEAR, size);
    const free = Uint8Array.from(x, (v, i) =>
      (v - lower <= near && g[i]! > 0) || (upper - v <= near && g[i]! < 0) ? 0 : 1,
    );
    // The direction: quasi-Newton on the free variables, steepest descent on the held ones; the steepest descent alone
    // where that does not descend.
    let d = quasiNewton(g, free, memory);
    for (let i = 0; i < d.length; i++) if (!free[i]) d[i] = -g[i]!;
    if (!(dot(d, g) < 0)) {
      d = g.map((v) => -v);
      memory.s.length = memory.y.length = 0;
    }
    // Halve the step along the projection arc until the cost falls by Armijo's rule.
    let step = 1;
    let next: Float64Array | null = null;
    let nextAt: ReturnType<CostWithGradient> | null = null;
    for (let h = 0; h < HALVINGS && evaluations < options.evaluations; h++, step /= 2) {
      const trial = Float64Array.from(x, (v, i) => clamp(v + step * d[i]!));
      const trialAt = cost(trial);
      evaluations++;
      let decrease = 0;
      for (let i = 0; i < x.length; i++) decrease += g[i]! * (trial[i]! - x[i]!);
      if (trialAt.cost <= at.cost + SUFFICIENT * decrease) {
        [next, nextAt] = [trial, trialAt];
        break;
      }
    }
    if (!next || !nextAt) break;
    const fell = at.cost - nextAt.cost;
    const s = Float64Array.from(next, (v, i) => v - x[i]!);
    const y = Float64Array.from(nextAt.gradient, (v, i) => v - g[i]!);
    if (dot(s, y) > CURVATURE * dot(y, y)) {
      memory.s.push(s);
      memory.y.push(y);
      if (memory.s.length > options.memory) {
        memory.s.shift();
        memory.y.shift();
      }
    }
    [x, at] = [next, nextAt];
    if (fell <= options.costTolerance * Math.max(Math.abs(at.cost), 1)) break;
  }
  return x;
}
