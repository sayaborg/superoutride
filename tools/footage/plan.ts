import type { FrameFeatures } from './features.js';
import type { FootageCamera } from './footage-model.js';
import { displayedSpeeds, frameMarks, travelled } from './calibrate.js';
import { BandedMatrix } from './banded-matrix.js';
import { median, robustCentre } from './statistics.js';

/**
 * The road's plan as one video's frames show it ([Initial estimate](../../docs/footage.md#initial-estimate)): its
 * curvature `κ`, constant on cells of `cell` metres from `start` (NaN where no frame shows it), and per frame its
 * chainage `s_c`, the camera's heading `θ` and its yaw from the road `ψ = θ − H(s_c)` (NaN where its points do not fix
 * them). `converged` is false when the steps ran out first.
 */
export interface PlanEstimate {
  readonly start: number;
  readonly cell: number;
  readonly curvature: readonly number[];
  readonly frames: readonly {
    readonly frame: number;
    readonly s: number;
    readonly heading: number;
    readonly yaw: number;
    /** `θ`'s standard error given the road's heading (rad). */
    readonly error: number;
  }[];
  /** The counted points' root-mean-square residual (px) and their count. */
  readonly residual: { readonly rms: number; readonly points: number };
  readonly rounds: number;
  readonly converged: boolean;
}

/** One frame's mark points: each point's mark, depth and column from `x₀`, and whether it counts. */
export interface FramePoints {
  readonly frame: number;
  readonly s: number;
  /** How many marks: marks of one line merge as the estimate shows them one ([mergeMarks]). */
  marks: number;
  readonly mark: Int32Array;
  readonly d: Float64Array;
  readonly x: Float64Array;
  readonly weight: Float64Array;
}

/**
 * Each frame's mark points: every line centre `x` of the roads connected to the one under the player's `column`, on a
 * row `u` rows below the horizon, at depth `d = K/u` on level road, of marks of three points or more (one fixes the
 * mark's lateral, and its rejection needs two more to judge it). A row less than one row below the horizon spans more
 * depth than it stands at (`K/u² > K/u`) and places no point. `s_c` is the displayed speed's integral from the first
 * frame. Road edges place no point: an edge's column moves with depth as its rumble strip falls below a column's width
 * (the asphalt's edge near, the strip's outer edge far), so an edge holds no one lateral along its mark.
 */
export function framePoints(features: readonly FrameFeatures[], camera: FootageCamera, column: number): FramePoints[] {
  const f = camera.focalLength.value,
    K = f * camera.height.value,
    x0 = camera.centerX.value,
    y0 = camera.horizonRow.value;
  const sc = travelled(features, displayedSpeeds(features));
  return features.map((frame, t) => {
    const marks = frameMarks(frame, column)
      .filter((mark) => mark.kind === 'line')
      .map((mark) => ({
        points: mark.ys.flatMap((y, k) => (y - y0 > 1 ? [{ d: K / (y - y0), x: mark.xs[k]! - x0 }] : [])),
      }))
      .filter(({ points }) => points.length >= 3);
    const count = marks.reduce((sum, { points }) => sum + points.length, 0);
    const out: FramePoints = {
      frame: frame.frame,
      s: sc[t]!,
      marks: marks.length,
      mark: new Int32Array(count),
      d: new Float64Array(count),
      x: new Float64Array(count),
      weight: new Float64Array(count).fill(1),
    };
    let i = 0;
    marks.forEach(({ points }, k) =>
      points.forEach(({ d, x }) => {
        out.mark[i] = k;
        out.d[i] = d;
        out.x[i++] = x;
      }),
    );
    return out;
  });
}

/**
 * The plan from one video's frame points. The road's heading `H(s)` is linear on cells as long as the frames' median
 * reach (the median of each frame's farthest point's depth), so its curvature is constant on each: a frame's marks bend
 * with the road only as far as they reach, and a shorter cell's curvature is told apart only by differencing
 * overlapping frames, which multiplies their noise. Each frame's camera has a heading `θ`, and each of its marks a
 * lateral `l` from the line through the camera along the road (the camera's own lateral drops out but for a curvature
 * difference of `κ²·l_c`, far below what frames show). Each point is one equation in game pixels, the pseudo projection
 * itself: `x − x₀ = (f/d)·(∫₀^d sin(H(s_c + σ) − θ) dσ + l·cos(H(s_c + d) − θ))`.
 *
 * All frames and rows are one least-squares problem, solved from a straight road and level headings by Gauss–Newton
 * steps with Marquardt's damping, each taken only when it lowers the weighted squares: each frame's `θ` and `l` touch
 * only its own equations and are eliminated in its normal equations, which leaves banded normal equations in `H` (a
 * frame reaches from `s_c` to its farthest point), solved by Cholesky; `θ` and `l` follow frame by frame. `H` is pinned
 * at its first node (headings are free of a common turn) and `κ` is weighed weakly (a millionth of the mean diagonal),
 * to bridge stretches no frame shows.
 *
 * After each step every octave of depth has its own noise, its residuals' robust deviation: each point weighs by its
 * octave's inverse variance, points beyond three of their deviations, and marks whose normalized root-mean-square
 * residual is (another road's, such as a fork's other branch), are left out, and marks the step shows to be one line
 * merge ([mergeMarks]). The steps end when none merge and the counted residuals move by less than a tenth of their
 * deviations (root mean square), or after `limit` steps, unconverged.
 */
export function solvePlan(frames: readonly FramePoints[], f: number, limit = 100): PlanEstimate {
  const start = Math.floor(frames[0]!.s);
  const reaches = frames.filter((frame) => frame.d.length).map((frame) => Math.max(...frame.d));
  if (!reaches.length) throw new RangeError('No frame shows a line');
  const cell = median(reaches);
  let nodes = 2,
    width = 2;
  const windows = frames.map((frame) => {
    if (!frame.d.length) return null;
    const first = Math.floor((frame.s - start) / cell),
      last = Math.floor((frame.s + Math.max(...frame.d) - start) / cell) + 1;
    nodes = Math.max(nodes, last + 1);
    width = Math.max(width, last - first);
    return { first, last };
  });
  let estimate: Estimate = {
    heading: new Float64Array(nodes),
    thetas: new Float64Array(frames.length),
    laterals: frames.map((frame) => new Float64Array(frame.marks)),
  };
  const residualsOf = (e: Estimate) =>
    frames.map((frame, t) => frameModel(frame, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell).residual);
  const squares = (residuals: readonly Float64Array[]) =>
    frames.reduce((sum, frame, t) => residuals[t]!.reduce((s, r, i) => s + frame.weight[i]! * r * r, sum), 0);
  let residuals = residualsOf(estimate);
  let rounds = 0,
    damping = 1e-3,
    converged = false;
  for (; rounds < limit; rounds++) {
    // One Levenberg–Marquardt step at the round's weights: damped until it lowers their weighted squares.
    const before = residuals;
    const cost = squares(residuals);
    for (; damping < 1e12; damping *= 10) {
      const delta = gaussNewtonStep(frames, windows, estimate, f, start, cell, width, damping);
      const trial: Estimate = {
        heading: estimate.heading.map((h, j) => h + delta.heading[j]!),
        thetas: estimate.thetas.map((theta, t) => theta + delta.thetas[t]!),
        laterals: estimate.laterals.map((l, t) => l.map((v, k) => v + delta.laterals[t]![k]!)),
      };
      const next = residualsOf(trial);
      const trialCost = squares(next);
      if (trialCost < cost) {
        estimate = trial;
        residuals = next;
        damping = Math.max(1e-9, damping / 10);
        break;
      }
    }
    // No step lowers them: the round's weights are at their least squares.
    if (damping >= 1e12) damping = 1e-3;
    // Each octave of depth has its own noise: its residuals' robust deviation, no less than a column's rounding. A point
    // weighs by its octave's inverse variance; points beyond three of their deviations, and marks whose normalized
    // root-mean-square residual is (another road's), are left out.
    const deviation = classDeviations(frames, residuals);
    let moved = 0,
      counted = 0;
    frames.forEach((frame, t) => {
      const r = residuals[t]!;
      const z = Float64Array.from(r, (v, i) => v / deviation(frame, i));
      const sums = new Float64Array(frame.marks),
        counts = new Float64Array(frame.marks);
      z.forEach((v, i) => {
        sums[frame.mark[i]!] = sums[frame.mark[i]!]! + v * v;
        counts[frame.mark[i]!] = counts[frame.mark[i]!]! + 1;
      });
      z.forEach((v, i) => {
        if (frame.weight[i]) {
          moved += ((r[i]! - before[t]![i]!) / deviation(frame, i)) ** 2;
          counted++;
        }
        const k = frame.mark[i]!;
        frame.weight[i] = Math.abs(v) <= 3 && sums[k]! <= 9 * counts[k]! ? deviation(frame, i) ** -2 : 0;
      });
    });
    const merged = frames.reduce(
      (sum, frame, t) =>
        sum +
        mergeMarks(
          frame,
          estimate.laterals,
          t,
          frameNormals(
            frame,
            frameModel(frame, estimate.heading, estimate.thetas[t]!, estimate.laterals[t]!, f, start, cell),
          ).precision,
        ),
      0,
    );
    if (merged) residuals = residualsOf(estimate);
    if (!merged && moved < 0.01 * counted) {
      converged = true;
      break;
    }
  }
  const { heading, thetas, laterals } = estimate;
  // Curvature where frames show the road: cells some counted point lies beyond.
  const shown = new Uint8Array(nodes);
  frames.forEach((frame) =>
    frame.d.forEach((d, i) => {
      if (!frame.weight[i]) return;
      for (let q = Math.floor((frame.s - start) / cell); q < Math.floor((frame.s + d - start) / cell); q++)
        shown[q] = 1;
    }),
  );
  const curvature = Array.from({ length: nodes - 1 }, (_, q) =>
    shown[q] ? (heading[q + 1]! - heading[q]!) / cell : NaN,
  );
  let sum = 0,
    points = 0;
  frames.forEach((frame, t) =>
    residuals[t]!.forEach((r, i) => {
      if (!frame.weight[i]) return;
      sum += r * r;
      points++;
    }),
  );
  const at = (s: number) => {
    const x = (s - start) / cell,
      j = Math.min(nodes - 2, Math.max(0, Math.floor(x)));
    return heading[j]! + (x - j) * (heading[j + 1]! - heading[j]!);
  };
  return {
    start,
    cell,
    curvature,
    frames: frames.map((frame, t) => {
      const variance = frameNormals(
        frame,
        frameModel(frame, heading, thetas[t]!, laterals[t]!, f, start, cell),
      ).variance;
      const known = Number.isFinite(variance);
      return {
        frame: frame.frame,
        s: frame.s,
        heading: known ? thetas[t]! : NaN,
        yaw: known ? thetas[t]! - at(frame.s) : NaN,
        error: Math.sqrt(variance),
      };
    }),
    residual: { rms: Math.sqrt(sum / points), points },
    rounds,
    converged,
  };
}

/** The unknowns: the road's heading at the nodes, and each frame's heading and its marks' laterals. */
interface Estimate {
  readonly heading: Float64Array;
  readonly thetas: Float64Array;
  readonly laterals: Float64Array[];
}

/** A point's class: its octave of depth in metres (1–2 m, 2–4 m and so on). */
const octave = (d: number) => Math.floor(Math.log2(d));

/** Each octave's robust residual deviation, no less than a column's rounding, as a lookup by frame and point. */
function classDeviations(frames: readonly FramePoints[], residuals: readonly Float64Array[]) {
  const samples = new Map<number, number[]>();
  const key = (frame: FramePoints, i: number) => octave(frame.d[i]!);
  frames.forEach((frame, t) =>
    residuals[t]!.forEach((r, i) => {
      if (!Number.isFinite(r)) return;
      const k = key(frame, i);
      if (!samples.has(k)) samples.set(k, []);
      samples.get(k)!.push(r);
    }),
  );
  const sigma = new Map(
    [...samples].map(([k, values]) => [k, Math.max(Math.sqrt(1 / 12), robustCentre(values).sigma)]),
  );
  return (frame: FramePoints, i: number) => sigma.get(key(frame, i)) ?? Math.sqrt(1 / 12);
}

/**
 * Merge a frame's marks that the estimate shows to be one line: marks whose counted points span depths
 * apart and whose laterals agree within three deviations (each lateral's precision, its points weighing by their
 * inverse variance), nearest first, as the dashes of a lane line share its lateral. Returns how many merged.
 */
function mergeMarks(frame: FramePoints, laterals: Float64Array[], t: number, precision: Float64Array) {
  const count = frame.marks;
  if (count < 2) return 0;
  const near = new Float64Array(count).fill(Infinity),
    far = new Float64Array(count).fill(-Infinity);
  frame.d.forEach((d, i) => {
    if (!frame.weight[i]) return;
    const k = frame.mark[i]!;
    near[k] = Math.min(near[k]!, d);
    far[k] = Math.max(far[k]!, d);
  });
  const lateral = laterals[t]!;
  // Groups: their members' depth spans, lateral and precision.
  const group = Int32Array.from({ length: count }, (_, k) => k);
  const spans = Array.from({ length: count }, (_, k) => [[near[k]!, far[k]!]] as [number, number][]);
  const value = Float64Array.from(lateral),
    weight = Float64Array.from(precision);
  const pairs: { a: number; b: number; z: number }[] = [];
  for (let a = 0; a < count; a++)
    for (let b = a + 1; b < count; b++) {
      if (!(weight[a]! > 0) || !(weight[b]! > 0) || near[a]! > far[a]!) continue;
      if (near[b]! > far[b]!) continue;
      const z = Math.abs(value[a]! - value[b]!) / Math.sqrt(1 / weight[a]! + 1 / weight[b]!);
      if (z <= 3) pairs.push({ a, b, z });
    }
  pairs.sort((p, q) => p.z - q.z);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k]!)));
  let merged = 0;
  for (const { a, b } of pairs) {
    const ra = root(a),
      rb = root(b);
    if (ra === rb) continue;
    const apart = spans[ra]!.every(([n1, f1]) => spans[rb]!.every(([n2, f2]) => f1 < n2 || f2 < n1));
    const z = Math.abs(value[ra]! - value[rb]!) / Math.sqrt(1 / weight[ra]! + 1 / weight[rb]!);
    if (!apart || z > 3) continue;
    group[rb] = ra;
    value[ra] = (value[ra]! * weight[ra]! + value[rb]! * weight[rb]!) / (weight[ra]! + weight[rb]!);
    weight[ra] = weight[ra]! + weight[rb]!;
    spans[ra]!.push(...spans[rb]!);
    merged++;
  }
  if (!merged) return 0;
  // Renumber the groups as the frame's marks.
  const index = new Int32Array(count).fill(-1);
  let next = 0;
  for (let k = 0; k < count; k++) if (index[root(k)] === -1) index[root(k)] = next++;
  frame.mark.forEach((k, i) => (frame.mark[i] = index[root(k)]!));
  const values = new Float64Array(next);
  for (let k = 0; k < count; k++) {
    values[index[root(k)]!] = value[root(k)]!;
  }
  frame.marks = next;
  laterals[t] = values;
  return merged;
}

/**
 * Along a frame's view, metre by metre from the camera: the heading relative to the camera's, `Φ(σ) = H(s_c + σ) − θ`,
 * sampled at each metre's middle, with the node `H` interpolates from there and the weight of the next.
 */
function view(frame: FramePoints, metres: number, heading: Float64Array, theta: number, start: number, cell: number) {
  const phi = new Float64Array(metres),
    node = new Int32Array(metres),
    weight = new Float64Array(metres);
  for (let m = 0; m < metres; m++) {
    const x = (frame.s + m + 0.5 - start) / cell,
      j = Math.min(heading.length - 2, Math.max(0, Math.floor(x)));
    node[m] = j;
    weight[m] = x - j;
    phi[m] = heading[j]! + (x - j) * (heading[j + 1]! - heading[j]!) - theta;
  }
  return { phi, node, weight };
}

/** The heading relative to the camera's at depth `d`, and the node and weight there. */
function headingAt(frame: FramePoints, d: number, heading: Float64Array, theta: number, start: number, cell: number) {
  const x = (frame.s + d - start) / cell,
    j = Math.min(heading.length - 2, Math.max(0, Math.floor(x)));
  return { phi: heading[j]! + (x - j) * (heading[j + 1]! - heading[j]!) - theta, j, a: x - j };
}

/**
 * A frame's residuals at the current estimate, and the model's derivatives in the frame's own unknowns: its heading `θ`
 * and each point's mark's lateral `l`.
 */
function frameModel(
  frame: FramePoints,
  heading: Float64Array,
  theta: number,
  lateral: Float64Array,
  f: number,
  start: number,
  cell: number,
) {
  const n = frame.d.length;
  const residual = new Float64Array(n),
    dTheta = new Float64Array(n),
    dLateral = new Float64Array(n);
  if (!n) return { residual, dTheta, dLateral };
  const metres = Math.ceil(Math.max(...frame.d)) + 1;
  const { phi } = view(frame, metres, heading, theta, start, cell);
  const sinPrefix = new Float64Array(metres + 1),
    cosPrefix = new Float64Array(metres + 1);
  for (let m = 0; m < metres; m++) {
    sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
    cosPrefix[m + 1] = cosPrefix[m]! + Math.cos(phi[m]!);
  }
  for (let i = 0; i < n; i++) {
    const d = frame.d[i]!,
      scale = f / d,
      l = lateral[frame.mark[i]!]!;
    const m = Math.floor(d),
      part = d - m,
      mm = Math.min(m, metres - 1);
    const end = headingAt(frame, d, heading, theta, start, cell).phi;
    residual[i] = frame.x[i]! - scale * (sinPrefix[m]! + part * Math.sin(phi[mm]!) + l * Math.cos(end));
    dTheta[i] = scale * (-(cosPrefix[m]! + part * Math.cos(phi[mm]!)) + l * Math.sin(end));
    dLateral[i] = scale * Math.cos(end);
  }
  return { residual, dTheta, dLateral };
}

/**
 * A frame's normal equations in its own unknowns at the round's weights: `θ`'s variance given the road's heading (each
 * mark's `l` eliminated; infinite where its points do not fix it) and each `l`'s precision.
 */
function frameNormals(frame: FramePoints, model: ReturnType<typeof frameModel>) {
  const { residual, dTheta, dLateral } = model;
  let tt = 0;
  const ll = new Float64Array(frame.marks),
    lt = new Float64Array(frame.marks);
  for (let i = 0; i < residual.length; i++) {
    const w = frame.weight[i]!;
    if (!w) continue;
    const k = frame.mark[i]!;
    tt += w * dTheta[i]! * dTheta[i]!;
    ll[k] = ll[k]! + w * dLateral[i]! * dLateral[i]!;
    lt[k] = lt[k]! + w * dLateral[i]! * dTheta[i]!;
  }
  let reduced = tt;
  ll.forEach((p, k) => {
    if (p > 0) reduced -= (lt[k]! * lt[k]!) / p;
  });
  return { variance: reduced > 1e-12 * tt ? 1 / reduced : Infinity, precision: ll };
}

/**
 * One Gauss–Newton step at the current estimate: the counted points' equations linearized in `H`'s nodes, each frame's
 * `θ` and its marks' `l` (the integrals taken metre by metre), the frame unknowns eliminated frame by frame, the banded
 * equations in `H` solved, and the frame unknowns' steps recovered.
 */
function gaussNewtonStep(
  frames: readonly FramePoints[],
  windows: readonly ({ first: number; last: number } | null)[],
  estimate: Estimate,
  f: number,
  start: number,
  cell: number,
  width: number,
  damping: number,
) {
  const { heading, thetas, laterals } = estimate;
  const nodes = heading.length;
  const normal = new BandedMatrix(nodes, width);
  const eliminations = frames.map((frame, t) => {
    const window = windows[t];
    if (!window) return null;
    const first = window.first,
      span = window.last - first + 1;
    const theta = thetas[t]!,
      lateral = laterals[t]!;
    const metres = Math.ceil(Math.max(...frame.d)) + 1;
    const { phi, node, weight } = view(frame, metres, heading, theta, start, cell);
    // Prefix sums along the view: ∫ sin Φ, ∫ cos Φ, and each node's ∫ cos Φ·(its hat), metre by metre.
    const sinPrefix = new Float64Array(metres + 1),
      cosPrefix = new Float64Array(metres + 1);
    const nodePrefix = new Float64Array((metres + 1) * span);
    for (let m = 0; m < metres; m++) {
      const c = Math.cos(phi[m]!);
      sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
      cosPrefix[m + 1] = cosPrefix[m]! + c;
      nodePrefix.copyWithin((m + 1) * span, m * span, (m + 1) * span);
      const j = node[m]! - first;
      if (j >= 0 && j < span) nodePrefix[(m + 1) * span + j] = nodePrefix[(m + 1) * span + j]! + c * (1 - weight[m]!);
      if (j + 1 >= 0 && j + 1 < span)
        nodePrefix[(m + 1) * span + j + 1] = nodePrefix[(m + 1) * span + j + 1]! + c * weight[m]!;
    }
    const block = new Float64Array(span * span),
      rhs = new Float64Array(span),
      th = new Float64Array(span);
    const marks = Array.from({ length: frame.marks }, () => ({ ll: 0, lt: 0, r: 0, h: new Float64Array(span) }));
    let tt = 0,
      tr = 0;
    const g = new Float64Array(span);
    for (let i = 0; i < frame.d.length; i++) {
      const w = frame.weight[i]!;
      if (!w) continue;
      const d = frame.d[i]!,
        scale = f / d,
        k = frame.mark[i]!,
        l = lateral[k]!;
      const m = Math.floor(d),
        part = d - m,
        mm = Math.min(m, metres - 1);
      const end = headingAt(frame, d, heading, theta, start, cell);
      const sinEnd = Math.sin(end.phi),
        cosEnd = Math.cos(end.phi);
      const residual = frame.x[i]! - scale * (sinPrefix[m]! + part * Math.sin(phi[mm]!) + l * cosEnd);
      // ∂/∂H_j: ∫ cos Φ·hat_j − l·sin Φ(d)·hat_j(d); ∂/∂θ: −∫ cos Φ + l·sin Φ(d); ∂/∂l: cos Φ(d).
      for (let j = 0; j < span; j++) g[j] = scale * nodePrefix[m * span + j]!;
      const jm = node[mm]! - first,
        cm = Math.cos(phi[mm]!) * part;
      if (jm >= 0 && jm < span) g[jm] = g[jm]! + scale * cm * (1 - weight[mm]!);
      if (jm + 1 >= 0 && jm + 1 < span) g[jm + 1] = g[jm + 1]! + scale * cm * weight[mm]!;
      const je = end.j - first;
      if (je >= 0 && je < span) g[je] = g[je]! - scale * l * sinEnd * (1 - end.a);
      if (je + 1 >= 0 && je + 1 < span) g[je + 1] = g[je + 1]! - scale * l * sinEnd * end.a;
      const gt = scale * (-(cosPrefix[m]! + part * Math.cos(phi[mm]!)) + l * sinEnd),
        gl = scale * cosEnd;
      const markSums = marks[k]!;
      for (let a = 0; a < span; a++) {
        if (g[a] === 0) continue;
        const ga = w * g[a]!;
        rhs[a] = rhs[a]! + ga * residual;
        th[a] = th[a]! + ga * gt;
        markSums.h[a] = markSums.h[a]! + ga * gl;
        for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! + ga * g[b]!;
      }
      tt += w * gt * gt;
      tr += w * gt * residual;
      markSums.ll += w * gl * gl;
      markSums.lt += w * gl * gt;
      markSums.r += w * gl * residual;
    }
    // Marquardt's damping on the frame's own unknowns, then each mark's l eliminated, then θ: rank-one corrections to
    // the H block.
    tt *= 1 + damping;
    for (const mark of marks) mark.ll *= 1 + damping;
    for (const mark of marks) {
      if (!(mark.ll > 0)) continue;
      for (let a = 0; a < span; a++) {
        const v = mark.h[a]! / mark.ll;
        if (v === 0) continue;
        rhs[a] = rhs[a]! - v * mark.r;
        th[a] = th[a]! - v * mark.lt;
        for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! - v * mark.h[b]!;
      }
      tt -= (mark.lt * mark.lt) / mark.ll;
      tr -= (mark.lt * mark.r) / mark.ll;
    }
    if (tt > 0)
      for (let a = 0; a < span; a++) {
        const v = th[a]! / tt;
        if (v === 0) continue;
        rhs[a] = rhs[a]! - v * tr;
        for (let b = 0; b <= a; b++) block[a * span + b] = block[a * span + b]! - v * th[b]!;
      }
    for (let a = 0; a < span; a++) {
      normal.rhs[first + a] = normal.rhs[first + a]! + rhs[a]!;
      for (let b = 0; b <= a; b++) if (block[a * span + b]) normal.add(first + a, first + b, block[a * span + b]!);
    }
    return { first, marks, tt, tr, th };
  });
  // Marquardt's damping on H; κ weighed weakly, and the pin on the first node, both on the estimate the step leads to.
  let total = 0;
  for (let j = 0; j < nodes; j++) total += normal.diagonal(j);
  for (let j = 0; j < nodes; j++) normal.add(j, j, damping * normal.diagonal(j));
  const mean = total / nodes,
    weak = 1e-6 * mean;
  for (let j = 0; j + 1 < nodes; j++) {
    const gap = heading[j + 1]! - heading[j]!;
    normal.add(j, j, weak);
    normal.add(j + 1, j + 1, weak);
    normal.add(j + 1, j, -weak);
    normal.rhs[j] = normal.rhs[j]! + weak * gap;
    normal.rhs[j + 1] = normal.rhs[j + 1]! - weak * gap;
  }
  normal.add(0, 0, mean);
  normal.rhs[0] = normal.rhs[0]! - mean * heading[0]!;
  const step = normal.solve();
  if (!step) throw new Error('The plan’s normal equations are not positive definite');
  const thetaSteps = new Float64Array(frames.length);
  const lateralSteps = frames.map((frame) => new Float64Array(frame.marks));
  eliminations.forEach((e, t) => {
    if (!e) return;
    const dot = (v: Float64Array) => v.reduce((sum, x, a) => sum + x * step[e.first + a]!, 0);
    const dt = e.tt > 0 ? (e.tr - dot(e.th)) / e.tt : 0;
    thetaSteps[t] = dt;
    e.marks.forEach((mark, k) => {
      lateralSteps[t]![k] = mark.ll > 0 ? (mark.r - mark.lt * dt - dot(mark.h)) / mark.ll : 0;
    });
  });
  return { heading: step, thetas: thetaSteps, laterals: lateralSteps };
}
