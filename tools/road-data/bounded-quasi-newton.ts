/**
 * A bounded quasi-Newton minimiser of the limited-memory kind (L-BFGS-B: Byrd, Lu, Nocedal and Zhu 1995, with Morales
 * and Nocedal's 2011 subspace step), for the grades' rule's solve ([Original road data](../../docs/original-road-data.md#profile-from-the-originals-screen)):
 * each iteration finds the generalised Cauchy point along the projected steepest descent on the limited-memory model,
 * minimises the model over the variables still free there, and searches along the step by Moré and Thuente's line
 * search (1994). Every variable is bounded.
 */

/** The machine's epsilon. */
const EPSILON = 2 ** -52;
/** The line search's sufficient decrease and curvature, its interval's tolerance, and its trial steps' limit. */
const DECREASE = 1e-3;
const CURVATURE = 0.9;
const INTERVAL = 0.1;
const MOST_TRIALS = 20;
/** The line search's extrapolation: a trial past the bracket lies 1.1 to 4 times the last step beyond it. */
const EXTRAPOLATE_LOW = 1.1;
const EXTRAPOLATE_HIGH = 4;

/** The cost and its gradient at x. */
export type CostWithGradient = (x: Float64Array) => { readonly cost: number; readonly gradient: Float64Array };

/** When the minimiser stops and how much it remembers. */
export interface QuasiNewtonOptions {
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

/** A dense square matrix's inverse by elimination with partial pivoting, null where it is singular. */
export function inverse(a: readonly Float64Array[]): Float64Array[] | null {
  const n = a.length;
  const m = a.map((row) => Float64Array.from(row));
  const inv = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (!(Math.abs(m[p]![c]!) > 0)) return null;
    [m[c], m[p]] = [m[p]!, m[c]!];
    [inv[c], inv[p]] = [inv[p]!, inv[c]!];
    const pivot = m[c]![c]!;
    for (let k = 0; k < n; k++) {
      m[c]![k]! /= pivot;
      inv[c]![k]! /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        m[r]![k]! -= f * m[c]![k]!;
        inv[r]![k]! -= f * inv[c]![k]!;
      }
    }
  }
  return inv;
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};
const times = (m: readonly Float64Array[], v: ArrayLike<number>) => Float64Array.from(m, (row) => dot(row, v));

/** The limited memory: the corrections s and y, oldest first, θ, W = [Y, θS] by rows and the middle matrix M. */
interface Memory {
  readonly s: Float64Array[];
  readonly y: Float64Array[];
  theta: number;
  /** W's row of variable i, 2 × the corrections long. */
  w: (i: number) => Float64Array;
  /** M, 2 × the corrections square: B = θI − W M Wᵀ. */
  middle: Float64Array[];
}

/** The middle matrix M = [[−D, Lᵀ], [L, θSᵀS]]⁻¹, D the sᵢᵀyᵢ and L the sᵢᵀyⱼ for i > j; null where singular. */
function middleOf(s: readonly Float64Array[], y: readonly Float64Array[], theta: number): Float64Array[] | null {
  const c = s.length;
  const k = Array.from({ length: 2 * c }, () => new Float64Array(2 * c));
  for (let i = 0; i < c; i++)
    for (let j = 0; j < c; j++) {
      const sy = dot(s[i]!, y[j]!);
      if (i === j) k[i]![j] = -sy;
      if (i > j) {
        k[c + i]![j] = sy;
        k[j]![c + i] = sy;
      }
      k[c + i]![c + j] = theta * dot(s[i]!, s[j]!);
    }
  return inverse(k);
}

function memoryOf(s: Float64Array[], y: Float64Array[], theta: number): Memory | null {
  const middle = s.length ? middleOf(s, y, theta) : [];
  if (!middle) return null;
  const c = s.length;
  const w = (i: number) => {
    const row = new Float64Array(2 * c);
    for (let j = 0; j < c; j++) {
      row[j] = y[j]![i]!;
      row[c + j] = theta * s[j]![i]!;
    }
    return row;
  };
  return { s, y, theta, w, middle };
}

/** The generalised Cauchy point from x along −g's projection, and c = Wᵀ(xcp − x), and which variables it frees. */
function cauchy(x: Float64Array, g: Float64Array, lo: number, hi: number, mem: Memory) {
  const n = x.length,
    c2 = mem.middle.length,
    theta = mem.theta;
  const xcp = Float64Array.from(x);
  const d = new Float64Array(n);
  const free = new Uint8Array(n).fill(1);
  const p = new Float64Array(c2);
  const breaks: { t: number; i: number }[] = [];
  let f1 = 0;
  for (let i = 0; i < n; i++) {
    const neg = -g[i]!;
    const atLower = x[i]! - lo <= 0,
      atUpper = hi - x[i]! <= 0;
    // A variable at a bound the descent pushes against stays there.
    if ((atLower && neg <= 0) || (atUpper && neg >= 0)) {
      free[i] = 0;
      continue;
    }
    if (neg === 0) continue;
    d[i] = neg;
    f1 -= neg * neg;
    if (c2) {
      const wi = mem.w(i);
      for (let j = 0; j < c2; j++) p[j]! += wi[j]! * neg;
    }
    breaks.push({ t: neg < 0 ? (x[i]! - lo) / -neg : (hi - x[i]!) / neg, i });
  }
  const c = new Float64Array(c2);
  if (!breaks.length) return { xcp, c, free };
  let f2 = -theta * f1;
  const f2Original = f2;
  if (c2) f2 -= dot(times(mem.middle, p), p);
  let dtm = -f1 / f2,
    tsum = 0,
    t = 0;
  breaks.sort((a, b) => a.t - b.t);
  let k = 0;
  for (; k < breaks.length; k++) {
    const { t: tj, i } = breaks[k]!;
    const dt = tj - t;
    if (dtm < dt) break;
    t = tj;
    tsum += dt;
    const di = d[i]!;
    d[i] = 0;
    const z = (di > 0 ? hi : lo) - x[i]!;
    xcp[i] = di > 0 ? hi : lo;
    free[i] = 0;
    if (k === breaks.length - 1 && breaks.length === n) {
      // Every variable reached a bound.
      dtm = dt;
      if (c2) for (let j = 0; j < c2; j++) c[j]! += dtm * p[j]!;
      return { xcp, c, free };
    }
    const d2 = di * di;
    f1 += dt * f2 + d2 - theta * di * z;
    f2 -= theta * d2;
    if (c2) {
      for (let j = 0; j < c2; j++) c[j]! += dt * p[j]!;
      const wb = mem.w(i);
      const v = times(mem.middle, wb);
      const wmc = dot(c, v),
        wmp = dot(p, v),
        wmw = dot(wb, v);
      for (let j = 0; j < c2; j++) p[j]! -= di * wb[j]!;
      f1 += di * wmc;
      f2 += 2 * di * wmp - d2 * wmw;
    }
    f2 = Math.max(EPSILON * f2Original, f2);
    // Past the last break point every variable is bounded: the search ends there.
    dtm = k < breaks.length - 1 ? -f1 / f2 : 0;
  }
  dtm = Math.max(0, dtm);
  tsum += dtm;
  for (let i = 0; i < n; i++) xcp[i]! += tsum * d[i]!;
  if (c2) for (let j = 0; j < c2; j++) c[j]! += dtm * p[j]!;
  return { xcp, c, free };
}

/**
 * The model's minimum over the free variables from the Cauchy point (the direct primal method), projected onto the
 * bounds where that still descends from x, else the step back along it to the first bound.
 */
function subspace(
  x: Float64Array,
  g: Float64Array,
  xcp: Float64Array,
  c: Float64Array,
  free: Uint8Array,
  lo: number,
  hi: number,
  mem: Memory,
): Float64Array {
  const n = x.length,
    c2 = mem.middle.length,
    theta = mem.theta;
  const index: number[] = [];
  for (let i = 0; i < n; i++) if (free[i]) index.push(i);
  if (!index.length || !c2) return xcp;
  // r = −Zᵀ(g + θ(xcp − x) − W M c).
  const mc = times(mem.middle, c);
  const rows = index.map((i) => mem.w(i));
  const r = Float64Array.from(index, (i, k) => -theta * (xcp[i]! - x[i]!) - g[i]! + dot(rows[k]!, mc));
  // d = r/θ + (1/θ²) ZᵀW (I − (1/θ) M WᵀZZᵀW)⁻¹ M WᵀZ r.
  const wzr = new Float64Array(c2);
  const wzzw = Array.from({ length: c2 }, () => new Float64Array(c2));
  rows.forEach((row, k) => {
    for (let a = 0; a < c2; a++) {
      wzr[a]! += row[a]! * r[k]!;
      for (let b = 0; b < c2; b++) wzzw[a]![b]! += row[a]! * row[b]!;
    }
  });
  const mwzzw = mem.middle.map((row) =>
    Float64Array.from({ length: c2 }, (_, b) =>
      dot(
        row,
        wzzw.map((q) => q[b]!),
      ),
    ),
  );
  const nMatrix = mwzzw.map((row, a) => Float64Array.from(row, (v, b) => (a === b ? 1 : 0) - v / theta));
  const nInverse = inverse(nMatrix);
  if (!nInverse) return xcp;
  const v = times(nInverse, times(mem.middle, wzr));
  const d = Float64Array.from(rows, (row, k) => r[k]! / theta + dot(row, v) / (theta * theta));
  // Projected onto the bounds, kept where it still descends from x.
  const z = Float64Array.from(xcp);
  let touched = false;
  index.forEach((i, k) => {
    const value = Math.min(hi, Math.max(lo, xcp[i]! + d[k]!));
    if (value === lo || value === hi) touched = true;
    z[i] = value;
  });
  if (!touched) return z;
  let descent = 0;
  for (let i = 0; i < n; i++) descent += (z[i]! - x[i]!) * g[i]!;
  if (descent <= 0) return z;
  // Else back along d from the Cauchy point to the first bound.
  const back = Float64Array.from(xcp);
  let alpha = 1,
    first = -1;
  index.forEach((i, k) => {
    const dk = d[k]!;
    let step = alpha;
    if (dk < 0) {
      const room = lo - back[i]!;
      if (room >= 0) step = 0;
      else if (dk * alpha < room) step = room / dk;
    } else if (dk > 0) {
      const room = hi - back[i]!;
      if (room <= 0) step = 0;
      else if (dk * alpha > room) step = room / dk;
    }
    if (step < alpha) {
      alpha = step;
      first = k;
    }
  });
  if (alpha < 1 && first >= 0) {
    const i = index[first]!;
    back[i] = d[first]! > 0 ? hi : lo;
    d[first] = 0;
  }
  index.forEach((i, k) => (back[i]! += alpha * d[k]!));
  return back;
}

/** Moré and Thuente's safeguarded step: a new trial step and the interval of uncertainty updated. */
function cstep(
  s: { stx: number; fx: number; dx: number; sty: number; fy: number; dy: number; brackt: boolean },
  stp: number,
  fp: number,
  dp: number,
  stpmin: number,
  stpmax: number,
): number {
  const { stx, fx, dx, sty, fy, dy } = s;
  const sgnd = dp * (dx / Math.abs(dx));
  let stpf: number;
  if (fp > fx) {
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp;
    const m = Math.max(Math.abs(theta), Math.abs(dx), Math.abs(dp));
    let gamma = m * Math.sqrt((theta / m) ** 2 - (dx / m) * (dp / m));
    if (stp < stx) gamma = -gamma;
    const p = gamma - dx + theta,
      q = gamma - dx + gamma + dp;
    const stpc = stx + (p / q) * (stp - stx);
    const stpq = stx + (dx / ((fx - fp) / (stp - stx) + dx) / 2) * (stp - stx);
    stpf = Math.abs(stpc - stx) < Math.abs(stpq - stx) ? stpc : stpc + (stpq - stpc) / 2;
    s.brackt = true;
  } else if (sgnd < 0) {
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp;
    const m = Math.max(Math.abs(theta), Math.abs(dx), Math.abs(dp));
    let gamma = m * Math.sqrt((theta / m) ** 2 - (dx / m) * (dp / m));
    if (stp > stx) gamma = -gamma;
    const p = gamma - dp + theta,
      q = gamma - dp + gamma + dx;
    const stpc = stp + (p / q) * (stx - stp);
    const stpq = stp + (dp / (dp - dx)) * (stx - stp);
    stpf = Math.abs(stpc - stp) > Math.abs(stpq - stp) ? stpc : stpq;
    s.brackt = true;
  } else if (Math.abs(dp) < Math.abs(dx)) {
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp;
    const m = Math.max(Math.abs(theta), Math.abs(dx), Math.abs(dp));
    let gamma = m * Math.sqrt(Math.max(0, (theta / m) ** 2 - (dx / m) * (dp / m)));
    if (stp > stx) gamma = -gamma;
    const p = gamma - dp + theta,
      q = gamma + (dx - dp) + gamma;
    const r = p / q;
    const stpc = r < 0 && gamma !== 0 ? stp + r * (stx - stp) : stp > stx ? stpmax : stpmin;
    const stpq = stp + (dp / (dp - dx)) * (stx - stp);
    if (s.brackt) {
      stpf = Math.abs(stpc - stp) < Math.abs(stpq - stp) ? stpc : stpq;
      stpf = stp > stx ? Math.min(stp + 0.66 * (sty - stp), stpf) : Math.max(stp + 0.66 * (sty - stp), stpf);
    } else {
      stpf = Math.abs(stpc - stp) > Math.abs(stpq - stp) ? stpc : stpq;
      stpf = Math.max(stpmin, Math.min(stpmax, stpf));
    }
  } else if (s.brackt) {
    const theta = (3 * (fp - fy)) / (sty - stp) + dy + dp;
    const m = Math.max(Math.abs(theta), Math.abs(dy), Math.abs(dp));
    let gamma = m * Math.sqrt((theta / m) ** 2 - (dy / m) * (dp / m));
    if (stp > sty) gamma = -gamma;
    const p = gamma - dp + theta,
      q = gamma - dp + gamma + dy;
    stpf = stp + (p / q) * (sty - stp);
  } else stpf = stp > stx ? stpmax : stpmin;
  if (fp > fx) {
    s.sty = stp;
    s.fy = fp;
    s.dy = dp;
  } else {
    if (sgnd < 0) {
      s.sty = stx;
      s.fy = fx;
      s.dy = dx;
    }
    s.stx = stp;
    s.fx = fp;
    s.dx = dp;
  }
  return stpf;
}

/**
 * Moré and Thuente's line search along d from x (cost f, slope g0 < 0) for a step meeting the strong Wolfe conditions,
 * within [0, stpmax]: the step, its point, cost and gradient, and the evaluations it took, or those it failed after.
 */
function lineSearch(
  fun: CostWithGradient,
  x: Float64Array,
  z: Float64Array,
  d: Float64Array,
  f0: number,
  g0: number,
  stp0: number,
  stpmax: number,
) {
  const at = (stp: number) => (stp === 1 ? Float64Array.from(z) : Float64Array.from(x, (xi, i) => stp * d[i]! + xi));
  const gtest = DECREASE * g0;
  const s = { stx: 0, fx: f0, dx: g0, sty: 0, fy: f0, dy: g0, brackt: false };
  let stage = 1,
    width = stpmax,
    width1 = 2 * width,
    stmin = 0,
    stmax = stp0 + EXTRAPOLATE_HIGH * stp0,
    stp = stp0;
  for (let trial = 1; ; trial++) {
    const point = at(stp);
    const { cost, gradient } = fun(point);
    const slope = dot(gradient, d);
    const ftest = f0 + stp * gtest;
    if (stage === 1 && cost <= ftest && slope >= 0) stage = 2;
    const done =
      (s.brackt && (stp <= stmin || stp >= stmax)) ||
      (s.brackt && stmax - stmin <= INTERVAL * stmax) ||
      (stp === stpmax && cost <= ftest && slope <= gtest) ||
      (stp === 0 && (cost > ftest || slope >= gtest)) ||
      (cost <= ftest && Math.abs(slope) <= CURVATURE * -g0);
    if (done) return { stp, point, cost, gradient, slope, evaluations: trial };
    if (trial >= MOST_TRIALS) return { failed: trial };
    if (stage === 1 && cost <= s.fx && cost > ftest) {
      const m = { ...s, fx: s.fx - s.stx * gtest, fy: s.fy - s.sty * gtest, dx: s.dx - gtest, dy: s.dy - gtest };
      stp = cstep(m, stp, cost - stp * gtest, slope - gtest, stmin, stmax);
      Object.assign(s, m, { fx: m.fx + m.stx * gtest, fy: m.fy + m.sty * gtest, dx: m.dx + gtest, dy: m.dy + gtest });
    } else stp = cstep(s, stp, cost, slope, stmin, stmax);
    if (s.brackt) {
      if (Math.abs(s.sty - s.stx) >= 0.66 * width1) stp = s.stx + 0.5 * (s.sty - s.stx);
      width1 = width;
      width = Math.abs(s.sty - s.stx);
      stmin = Math.min(s.stx, s.sty);
      stmax = Math.max(s.stx, s.sty);
    } else {
      stmin = stp + EXTRAPOLATE_LOW * (stp - s.stx);
      stmax = stp + EXTRAPOLATE_HIGH * (stp - s.stx);
    }
    stp = Math.min(stpmax, Math.max(0, stp));
    if ((s.brackt && (stp <= stmin || stp >= stmax)) || (s.brackt && stmax - stmin <= INTERVAL * stmax)) stp = s.stx;
  }
}

/** The projected gradient's largest component. */
function projectedNorm(x: Float64Array, g: Float64Array, lo: number, hi: number) {
  let norm = 0;
  for (let i = 0; i < x.length; i++) {
    const gi = g[i]! < 0 ? Math.max(x[i]! - hi, g[i]!) : Math.min(x[i]! - lo, g[i]!);
    norm = Math.max(norm, Math.abs(gi));
  }
  return norm;
}

/** The minimiser of `fun` from `x0` within [lower, upper] for every variable. */
export function minimiseBounded(
  fun: CostWithGradient,
  x0: ArrayLike<number>,
  options: QuasiNewtonOptions,
): Float64Array {
  const { lower: lo, upper: hi, memory: most } = options;
  let x = Float64Array.from(x0, (v) => Math.min(hi, Math.max(lo, v)));
  let { cost: f, gradient: g } = fun(x);
  let evaluations = 1;
  let s: Float64Array[] = [],
    y: Float64Array[] = [];
  let mem = memoryOf(s, y, 1)!;
  if (projectedNorm(x, g, lo, hi) <= options.gradientTolerance) return x;
  for (let iteration = 0; ;) {
    const { xcp, c, free } = cauchy(x, g, lo, hi, mem);
    const z = subspace(x, g, xcp, c, free, lo, hi, mem);
    const d = Float64Array.from(z, (zi, i) => zi - x[i]!);
    const g0 = dot(g, d);
    let stpmax = Infinity;
    if (iteration === 0) stpmax = 1;
    else
      for (let i = 0; i < x.length; i++) {
        const di = d[i]!;
        if (di < 0) {
          const room = lo - x[i]!;
          if (room >= 0) stpmax = 0;
          else if (di * stpmax < room) stpmax = room / di;
        } else if (di > 0) {
          const room = hi - x[i]!;
          if (room <= 0) stpmax = 0;
          else if (di * stpmax > room) stpmax = room / di;
        }
      }
    const search = g0 < 0 ? lineSearch(fun, x, z, d, f, g0, Math.min(1, stpmax), stpmax) : { failed: 0 };
    if (search.failed !== undefined) {
      evaluations += search.failed;
      // Not a descent, or the search failed: forget the corrections and start again from the steepest descent.
      if (!s.length) return x;
      s = [];
      y = [];
      mem = memoryOf(s, y, 1)!;
      continue;
    }
    const { stp, point, cost, gradient, slope } = search;
    evaluations += search.evaluations;
    const fOld = f,
      gOld = g;
    x = point;
    f = cost;
    g = gradient;
    iteration++;
    if (projectedNorm(x, g, lo, hi) <= options.gradientTolerance) return x;
    if (fOld - f <= options.costTolerance * Math.max(Math.abs(fOld), Math.abs(f), 1)) return x;
    if (iteration >= options.iterations || evaluations > options.evaluations) return x;
    // The correction, skipped where its curvature is not positive enough.
    const dr = (slope - g0) * stp,
      ddum = -g0 * stp;
    if (dr > EPSILON * ddum) {
      const sk = Float64Array.from(d, (di) => di * stp);
      const yk = Float64Array.from(g, (gi, i) => gi - gOld[i]!);
      s.push(sk);
      y.push(yk);
      if (s.length > most) {
        s.shift();
        y.shift();
      }
      const next = memoryOf(s, y, dot(yk, yk) / dr);
      if (next) mem = next;
      else {
        s = [];
        y = [];
        mem = memoryOf(s, y, 1)!;
      }
    }
  }
}
