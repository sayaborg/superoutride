/**
 * A least-squares solver for [a lap on its model](../../../docs/original-road-data.md#a-lap-on-its-model): Levenberg's
 * and Marquardt's damped Gauss–Newton method (Levenberg 1944, Marquardt 1963) on a residual vector and its Jacobian,
 * the damping scaled by the normal matrix's diagonal, equality constraints met by each step's linearized system with
 * Lagrange's multipliers (the KKT system) and the step brought back onto them by Newton's steps least in norm; a step is
 * taken where the cost falls. It is deterministic: its sums run in one order, and it stops after a fixed number of
 * iterations or where a step no longer lowers the cost by a fixed share.
 */

/** Values at x, and with `jacobian` their Jacobian, a column a variable. */
export type Linearized = (
  x: Float64Array,
  jacobian: boolean,
) => { readonly values: Float64Array; readonly columns?: readonly Float64Array[] };

/** When the solver stops. */
export interface LeastSquaresOptions {
  /** Iterations, each one Jacobian. */
  readonly iterations: number;
  /** Stop where an accepted step lowers the cost by at most this share of it. */
  readonly costTolerance: number;
}

/** The damping's start, its growth on a step refused and its fall on one taken, and its floor and ceiling. */
export const DAMPING = 1e-3;
export const GROW = 10;
export const FALL = 0.3;
export const FLOOR = 1e-12;
export const CEILING = 1e12;
/** How near 0 the constraints are brought after a step, and in at most how many Newton's steps. */
export const RESTORED = 1e-12;
export const RESTORES = 8;

/** Half the sum of r's squares, summed in order. */
export function halfSquares(r: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < r.length; i++) sum += r[i]! * r[i]!;
  return sum / 2;
}

/** The sum of a[i] b[i]. */
function dot(a: Float64Array, b: Float64Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

/** x solving A x = b by Gauss's elimination with partial pivoting, or undefined where A is singular. */
export function solveLinear(a: readonly Float64Array[], b: Float64Array): Float64Array | undefined {
  const n = b.length;
  const m = a.map((row, i) => Float64Array.from([...row, b[i]!]));
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(m[i]![k]!) > Math.abs(m[p]![k]!)) p = i;
    if (!(Math.abs(m[p]![k]!) > 0)) return undefined;
    [m[k], m[p]] = [m[p]!, m[k]!];
    for (let i = k + 1; i < n; i++) {
      const f = m[i]![k]! / m[k]![k]!;
      if (f === 0) continue;
      for (let j = k; j <= n; j++) m[i]![j] = m[i]![j]! - f * m[k]![j]!;
    }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = m[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= m[i]![j]! * x[j]!;
    x[i] = sum / m[i]![i]!;
  }
  return x;
}

/** Newton's steps least in norm that bring `constraints` to within `RESTORED` of 0 from x, or undefined. */
function restore(constraints: Linearized, x0: Float64Array): Float64Array | undefined {
  let x = x0;
  for (let k = 0; k < RESTORES; k++) {
    const c = constraints(x, true);
    if (c.values.every((v) => Math.abs(v) <= RESTORED)) return x;
    const columns = c.columns!;
    const m = c.values.length;
    // C Cᵀ y = c, x −= Cᵀ y.
    const normal = Array.from({ length: m }, (_, a) =>
      Float64Array.from({ length: m }, (_, b) => columns.reduce((sum, col) => sum + col[a]! * col[b]!, 0)),
    );
    const y = solveLinear(normal, c.values);
    if (!y) return undefined;
    x = Float64Array.from(x, (v, j) => v - columns[j]!.reduce((sum, cv, a) => sum + cv * y[a]!, 0));
  }
  return constraints(x, false).values.every((v) => Math.abs(v) <= RESTORED) ? x : undefined;
}

/**
 * The x near `x0` least in half the squares of `residuals` where `constraints` are 0: damped Gauss–Newton steps each
 * meeting the constraints' linearization, each brought back onto them by `restore` before its cost is weighed.
 */
export function constrainedLeastSquares(
  residuals: Linearized,
  constraints: Linearized,
  x0: Float64Array,
  options: LeastSquaresOptions,
): Float64Array {
  const n = x0.length;
  let x = restore(constraints, x0) ?? Float64Array.from(x0);
  let cost = halfSquares(residuals(x, false).values);
  let damping = DAMPING;
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    const r = residuals(x, true);
    const c = constraints(x, true);
    const [columns, constraintColumns] = [r.columns!, c.columns!];
    const m = c.values.length;
    const normal = columns.map((a) => Float64Array.from(columns, (b) => dot(a, b)));
    const right = Float64Array.from([...columns.map((a) => -dot(a, r.values)), ...Array.from(c.values, (v) => -v)]);
    let taken = false;
    while (!taken && damping <= CEILING) {
      // [JᵀJ + λ diag(JᵀJ), Cᵀ; C, 0] [δ; ν] = [−Jᵀ r; −c]
      const system = Array.from({ length: n + m }, (_, i) => {
        const row = new Float64Array(n + m);
        if (i < n) {
          row.set(normal[i]!);
          row[i] = normal[i]![i]! * (1 + damping) + 1e-300;
          for (let k = 0; k < m; k++) row[n + k] = constraintColumns[i]![k]!;
        } else for (let j = 0; j < n; j++) row[j] = constraintColumns[j]![i - n]!;
        return row;
      });
      const delta = solveLinear(system, right);
      const next =
        delta &&
        restore(
          constraints,
          Float64Array.from(x, (v, i) => v + delta[i]!),
        );
      const nextCost = next ? halfSquares(residuals(next, false).values) : Infinity;
      if (next && nextCost < cost) {
        const fell = cost - nextCost;
        [x, cost, taken] = [next, nextCost, true];
        damping = Math.max(damping * FALL, FLOOR);
        if (fell <= options.costTolerance * cost) return x;
      } else damping *= GROW;
    }
    if (!taken) return x;
  }
  return x;
}
