import type { FrameFeatures } from './features.js';
import type { FootageCamera, PitchRule } from './footage-model.js';
import { displayedSpeeds, frameMarks, travelled } from './calibrate.js';
import { BandedMatrix } from './banded-matrix.js';
import { median, robustCentre } from './statistics.js';

/**
 * The road's plan and profile as one video's frames show them ([Initial estimate](../../docs/footage.md#initial-estimate)):
 * on cells of `cell` metres from `start`, its curvature `κ`, constant on each cell (NaN where no frame shows it), and
 * its height `Y` at the cells' nodes, linear between them (NaN where none shows it), under the pitch `rule`, its frames'
 * grades weighed by `gradeWeight`; per frame its chainage `s_c`, the camera's heading `θ`, its yaw from the road
 * `ψ = θ − H(s_c)` (NaN where its points do not fix them) and its pitch `φ`. `converged` is false when the steps ran out
 * first.
 */
export interface PlanEstimate {
  readonly rule: PitchRule;
  readonly start: number;
  readonly cell: number;
  readonly curvature: readonly number[];
  readonly height: readonly number[];
  /** The weight of the frames' squared grades, px² per grade² (0 for none beyond the weak grade differences). */
  readonly gradeWeight: number;
  readonly frames: readonly {
    readonly frame: number;
    readonly s: number;
    readonly heading: number;
    readonly yaw: number;
    /** `θ`'s standard error given the road's heading and height (rad). */
    readonly error: number;
    readonly pitch: number;
  }[];
  /** The counted points' root-mean-square residual (px) and their count. */
  readonly residual: { readonly rms: number; readonly points: number };
  readonly rounds: number;
  readonly converged: boolean;
}

/** One frame's mark points: each point's mark, row and column from `x₀`, and whether it counts. */
export interface FramePoints {
  readonly frame: number;
  readonly s: number;
  /** How many marks: marks of one line merge as the estimate shows them one ([mergeMarks]). */
  marks: number;
  readonly mark: Int32Array;
  readonly y: Float64Array;
  readonly x: Float64Array;
  readonly weight: Float64Array;
}

/**
 * Each frame's mark points: every line centre `x` of the roads connected to the one under the player's `column`, on a
 * row more than one row below the horizon `y₀`, of marks of three points or more (one fixes the mark's lateral, and its
 * rejection needs two more to judge it). A row less than one row below the horizon spans more depth than it stands at
 * (`K/u² > K/u`) and places no point. `s_c` is the displayed speed's integral from the first frame. Road edges place no
 * point: an edge's column moves with depth as its rumble strip falls below a column's width (the asphalt's edge near,
 * the strip's outer edge far), so an edge holds no one lateral along its mark.
 */
export function framePoints(features: readonly FrameFeatures[], camera: FootageCamera, column: number): FramePoints[] {
  const x0 = camera.centerX.value,
    y0 = camera.horizonRow.value;
  const sc = travelled(features, displayedSpeeds(features));
  return features.map((frame, t) => {
    const marks = frameMarks(frame, column)
      .filter((mark) => mark.kind === 'line')
      .map((mark) => ({
        points: mark.ys.flatMap((y, k) => (y - y0 > 1 ? [{ y, x: mark.xs[k]! - x0 }] : [])),
      }))
      .filter(({ points }) => points.length >= 3);
    const count = marks.reduce((sum, { points }) => sum + points.length, 0);
    const out: FramePoints = {
      frame: frame.frame,
      s: sc[t]!,
      marks: marks.length,
      mark: new Int32Array(count),
      y: new Float64Array(count),
      x: new Float64Array(count),
      weight: new Float64Array(count).fill(1),
    };
    let i = 0;
    marks.forEach(({ points }, k) =>
      points.forEach(({ y, x }) => {
        out.mark[i] = k;
        out.y[i] = y;
        out.x[i++] = x;
      }),
    );
    return out;
  });
}

/** The unknowns: the road's heading and height at the nodes, and each frame's heading and its marks' laterals. */
interface Estimate {
  readonly heading: Float64Array;
  readonly height: Float64Array;
  readonly thetas: Float64Array;
  readonly laterals: Float64Array[];
  /** Each point's depth, as its row lies on the profile (NaN where it lies on none). */
  readonly depths: readonly Float64Array[];
}

/**
 * One video's plan and profile problem. Each point is one equation in game pixels, the pseudo projection itself:
 * `x − x₀ = (f/d)·(∫₀^d sin(H(s_c + σ) − θ) dσ + l·cos(H(s_c + d) − θ))`, with the road's heading `H(s)`, each frame's
 * camera heading `θ` and each mark's lateral `l` from the line through the camera along the road (the camera's own
 * lateral drops out but for a curvature difference of `κ²·l_c`, far below what frames show), at the depth `d` its
 * row lies at on the profile, `y = y₀ − f·sin φ + (f/d)·(Y(s_c) + h − Y(s_c + d))·cos φ`: the camera `h` above the road
 * beneath it, and pitching by the rule, `φ = 0` under `level` and along the road's chord from the camera to the player,
 * `φ = −atan((Y(s_c + D′) − Y(s_c))/D′)`, under `road`. A height the depth misplaces scales a mark's column by `ΔY/h`,
 * so marks aside from the camera show the profile. With no rule the heights are held level: the plan alone, which both
 * rules share.
 *
 * `H` and `Y` are linear on cells as long as the frames' median reach (the median of each frame's farthest point's
 * depth on level road, `K/u`): a frame's marks bend and rise with the road only as far as they reach, and a shorter
 * cell is told apart only by differencing overlapping frames, which multiplies their noise. Each frame's `θ` and `l`
 * touch only its own equations and are eliminated in its normal equations, which leaves banded normal equations in `H`
 * and `Y` (a frame reaches from `s_c` to its farthest point), solved by Cholesky. `H` and `Y` are pinned at their first
 * node, and `κ` and the grade are weighed weakly (a millionth of their mean diagonals), to bridge stretches no frame
 * shows.
 */
function planProblem(frames: readonly FramePoints[], camera: FootageCamera, rule: PitchRule | null) {
  const f = camera.focalLength.value,
    h = camera.height.value,
    y0 = camera.horizonRow.value,
    D = camera.playerDistance.value,
    K = f * h;
  const levelReach = (frame: FramePoints) => K / (Math.min(...frame.y) - y0);
  const reaches = frames.filter((frame) => frame.y.length).map(levelReach);
  if (!reaches.length) throw new RangeError('No frame shows a line');
  const cell = median(reaches);
  const start = Math.floor(frames[0]!.s);
  // Nodes through each frame's farthest point, a profile placing it at most twice as far as level road does.
  const nodes = Math.max(
    2,
    ...frames.map((frame) => Math.floor((frame.s + 2 * (frame.y.length ? levelReach(frame) : D) - start) / cell) + 2),
  );
  const node = (x: number) => {
    const q = (x - start) / cell,
      j = Math.min(nodes - 2, Math.max(0, Math.floor(q)));
    return { j, a: q - j };
  };
  const heightAt = (height: Float64Array, x: number) => {
    const { j, a } = node(x);
    return height[j]! * (1 - a) + height[j + 1]! * a;
  };
  const slopeAt = (values: Float64Array, x: number) => {
    const { j } = node(x);
    return (values[j + 1]! - values[j]!) / cell;
  };
  /** The camera's grade over its chord to the player, `(Y(s_c + D′) − Y(s_c))/D′`, as its nodes' coefficients. */
  const chord = (s: number) => {
    const near = node(s),
      far = node(s + D);
    return [
      [near.j, -(1 - near.a) / D],
      [near.j + 1, -near.a / D],
      [far.j, (1 - far.a) / D],
      [far.j + 1, far.a / D],
    ] as const;
  };
  const grade = (height: Float64Array, s: number) => chord(s).reduce((sum, [j, c]) => sum + c * height[j]!, 0);
  const pitchOf = (height: Float64Array, s: number) => (rule === 'road' ? -Math.atan(grade(height, s)) : 0);
  const inRange = (x: number) => x >= start && x <= start + (nodes - 1) * cell;

  /**
   * Each of a frame's points' depth on the profile: the root of `g(d) = d·(y − y_h) − f·(Y(s_c) + h − Y(s_c + d))·cos φ`
   * by Newton's steps from level road, until a step moves it by less than a millionth; NaN where the row lies above
   * the frame's horizon, the steps leave the nodes or the road there faces away (`g′ ≤ 0`, past a crest).
   */
  const frameDepths = (frame: FramePoints, height: Float64Array) => {
    const phi = pitchOf(height, frame.s),
      cos = Math.cos(phi),
      horizon = y0 - f * Math.sin(phi),
      cameraHeight = heightAt(height, frame.s) + h;
    return Float64Array.from(frame.y, (y) => {
      const u = y - horizon;
      if (!(u > 0)) return NaN;
      let d = (f * (cameraHeight - heightAt(height, frame.s)) * cos) / u;
      for (let step = 0; step < 50; step++) {
        if (!(d > 0) || !inRange(frame.s + d)) return NaN;
        const g = d * u - f * (cameraHeight - heightAt(height, frame.s + d)) * cos,
          slope = u + f * cos * slopeAt(height, frame.s + d);
        if (!(slope > 0)) return NaN;
        const next = d - g / slope;
        if (Math.abs(next - d) < 1e-6 * d) return next > 0 && inRange(frame.s + next) ? next : NaN;
        d = next;
      }
      return NaN;
    });
  };
  const estimateOf = (
    heading: Float64Array,
    height: Float64Array,
    thetas: Float64Array,
    laterals: Float64Array[],
  ): Estimate => ({ heading, height, thetas, laterals, depths: frames.map((frame) => frameDepths(frame, height)) });

  const residualsOf = (e: Estimate) =>
    frames.map(
      (frame, t) => frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell).residual,
    );
  /** The counted points' weighted squares, over the points `other` also places when given. */
  const squares = (residuals: readonly Float64Array[], other?: readonly Float64Array[]) => {
    let sum = 0;
    frames.forEach((frame, t) =>
      residuals[t]!.forEach((r, i) => {
        if (frame.weight[i] && Number.isFinite(r) && (!other || Number.isFinite(other[t]![i]!)))
          sum += frame.weight[i]! * r * r;
      }),
    );
    return sum;
  };
  const gradeSquares = (height: Float64Array) => frames.reduce((sum, frame) => sum + grade(height, frame.s) ** 2, 0);

  /**
   * One Gauss–Newton step at the estimate with Marquardt's damping: the counted points' equations linearized in the
   * nodes' `H` and `Y` (interleaved, `H_j` at `2j` and `Y_j` at `2j + 1`), each frame's `θ` and its marks' `l` (the
   * integrals taken metre by metre), the frame unknowns eliminated frame by frame, the banded equations solved, and the
   * frame unknowns' steps recovered. `Y` moves a point through its depth: `∂d/∂Y = −(∂g/∂Y)/g′`.
   */
  const step = (e: Estimate, damping: number, gradeWeight: number): Estimate => {
    const windows = frames.map((frame, t) => {
      const depths = e.depths[t]!;
      let far = D;
      depths.forEach((d, i) => frame.weight[i] && Number.isFinite(d) && (far = Math.max(far, d)));
      return { first: node(frame.s).j, last: node(frame.s + far).j + 1 };
    });
    const width = 2 * Math.max(...windows.map((w) => w.last - w.first)) + 1;
    const normal = new BandedMatrix(2 * nodes, width);
    const eliminations = frames.map((frame, t) => {
      const { first, last } = windows[t]!,
        span = 2 * (last - first + 1);
      const depths = e.depths[t]!;
      const theta = e.thetas[t]!,
        lateral = e.laterals[t]!;
      let far = 0;
      depths.forEach((d, i) => frame.weight[i] && Number.isFinite(d) && (far = Math.max(far, d)));
      if (!far) return null;
      const metres = Math.ceil(far) + 1;
      const { phi, node: nodeOf, weight } = view(frame, metres, e.heading, theta, start, cell);
      // Prefix sums along the view: ∫ sin Φ, ∫ cos Φ, and each node's ∫ cos Φ·(its hat), metre by metre.
      const nodesHere = last - first + 1;
      const sinPrefix = new Float64Array(metres + 1),
        cosPrefix = new Float64Array(metres + 1);
      const nodePrefix = new Float64Array((metres + 1) * nodesHere);
      for (let m = 0; m < metres; m++) {
        const c = Math.cos(phi[m]!);
        sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
        cosPrefix[m + 1] = cosPrefix[m]! + c;
        nodePrefix.copyWithin((m + 1) * nodesHere, m * nodesHere, (m + 1) * nodesHere);
        const j = nodeOf[m]! - first;
        if (j >= 0 && j < nodesHere)
          nodePrefix[(m + 1) * nodesHere + j] = nodePrefix[(m + 1) * nodesHere + j]! + c * (1 - weight[m]!);
        if (j + 1 >= 0 && j + 1 < nodesHere)
          nodePrefix[(m + 1) * nodesHere + j + 1] = nodePrefix[(m + 1) * nodesHere + j + 1]! + c * weight[m]!;
      }
      // The frame's pitch and its derivatives in the nodes' heights.
      const pitch = pitchOf(e.height, frame.s),
        cos = Math.cos(pitch),
        sin = Math.sin(pitch);
      const pitchChord = rule === 'road' ? chord(frame.s) : [];
      const byGrade = -1 / (1 + Math.tan(pitch) ** 2);
      const cameraNode = node(frame.s),
        cameraHeight = heightAt(e.height, frame.s) + h,
        horizon = y0 - f * sin;
      const block = new Float64Array(span * span),
        rhs = new Float64Array(span),
        th = new Float64Array(span);
      const marks = Array.from({ length: frame.marks }, () => ({ ll: 0, lt: 0, r: 0, h: new Float64Array(span) }));
      let tt = 0,
        tr = 0;
      const g = new Float64Array(span);
      const addY = (j: number, v: number) => {
        const a = 2 * (j - first) + 1;
        if (rule && a > 0 && a < span) g[a] = g[a]! + v;
      };
      for (let i = 0; i < frame.y.length; i++) {
        const w = frame.weight[i]!,
          d = depths[i]!;
        if (!w || !Number.isFinite(d)) continue;
        const scale = f / d,
          k = frame.mark[i]!,
          l = lateral[k]!;
        const m = Math.floor(d),
          part = d - m,
          mm = Math.min(m, metres - 1);
        const end = headingAt(frame, d, e.heading, theta, start, cell);
        const sinEnd = Math.sin(end.phi),
          cosEnd = Math.cos(end.phi);
        const model = scale * (sinPrefix[m]! + part * Math.sin(phi[mm]!) + l * cosEnd);
        const residual = frame.x[i]! - model;
        g.fill(0);
        // ∂/∂H_j: ∫ cos Φ·hat_j − l·sin Φ(d)·hat_j(d); ∂/∂θ: −∫ cos Φ + l·sin Φ(d); ∂/∂l: cos Φ(d).
        for (let j = 0; j < nodesHere; j++) g[2 * j] = scale * nodePrefix[m * nodesHere + j]!;
        const jm = nodeOf[mm]! - first,
          cm = Math.cos(phi[mm]!) * part;
        if (jm >= 0 && jm < nodesHere) g[2 * jm] = g[2 * jm]! + scale * cm * (1 - weight[mm]!);
        if (jm + 1 >= 0 && jm + 1 < nodesHere) g[2 * jm + 2] = g[2 * jm + 2]! + scale * cm * weight[mm]!;
        const je = end.j - first;
        if (je >= 0 && je < nodesHere) g[2 * je] = g[2 * je]! - scale * l * sinEnd * (1 - end.a);
        if (je + 1 >= 0 && je + 1 < nodesHere) g[2 * je + 2] = g[2 * je + 2]! - scale * l * sinEnd * end.a;
        // ∂/∂Y_j through the depth: ∂x/∂d·∂d/∂Y_j, with ∂d/∂Y_j = −(∂g/∂Y_j)/g′.
        const curvatureEnd = (e.heading[end.j + 1]! - e.heading[end.j]!) / cell;
        const byDepth = -model / d + scale * sinEnd * (1 - l * curvatureEnd);
        const drop = cameraHeight - heightAt(e.height, frame.s + d);
        const slope = frame.y[i]! - horizon + f * cos * slopeAt(e.height, frame.s + d);
        const along = node(frame.s + d);
        const factor = -byDepth / slope;
        addY(cameraNode.j, factor * -f * cos * (1 - cameraNode.a));
        addY(cameraNode.j + 1, factor * -f * cos * cameraNode.a);
        addY(along.j, factor * f * cos * (1 - along.a));
        addY(along.j + 1, factor * f * cos * along.a);
        const byPitch = d * f * cos + f * drop * sin;
        for (const [j, c] of pitchChord) addY(j, factor * byPitch * byGrade * c);
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
      // Marquardt's damping on the frame's own unknowns, then each mark's l eliminated, then θ: rank-one corrections
      // to the nodes' block.
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
      const offset = 2 * first;
      for (let a = 0; a < span; a++) {
        normal.rhs[offset + a] = normal.rhs[offset + a]! + rhs[a]!;
        for (let b = 0; b <= a; b++) if (block[a * span + b]) normal.add(offset + a, offset + b, block[a * span + b]!);
      }
      return { offset, marks, tt, tr, th };
    });
    // Marquardt's damping on the nodes; the frames' grades weighed by `gradeWeight`; κ and the grade weighed weakly,
    // and the pins on the first nodes, all on the estimate the step leads to.
    const means = [0, 0];
    for (let i = 0; i < 2 * nodes; i++) means[i % 2] = means[i % 2]! + normal.diagonal(i) / nodes;
    for (let i = 0; i < 2 * nodes; i++) normal.add(i, i, damping * normal.diagonal(i));
    if (gradeWeight > 0)
      for (const frame of frames) {
        const coefficients = chord(frame.s),
          value = grade(e.height, frame.s);
        for (let a = 0; a < 4; a++) {
          const [ja, ca] = coefficients[a]!;
          normal.rhs[2 * ja + 1] = normal.rhs[2 * ja + 1]! - gradeWeight * ca * value;
          for (let b = 0; b <= a; b++) {
            const [jb, cb] = coefficients[b]!;
            normal.add(2 * ja + 1, 2 * jb + 1, gradeWeight * ca * cb * (ja === jb && a !== b ? 2 : 1));
          }
        }
      }
    [e.heading, e.height].forEach((values, kind) => {
      const weak = 1e-6 * means[kind]!;
      for (let j = 0; j + 1 < nodes; j++) {
        const a = 2 * j + kind,
          b = a + 2,
          gap = values[j + 1]! - values[j]!;
        normal.add(a, a, weak);
        normal.add(b, b, weak);
        normal.add(b, a, -weak);
        normal.rhs[a] = normal.rhs[a]! + weak * gap;
        normal.rhs[b] = normal.rhs[b]! - weak * gap;
      }
      normal.add(kind, kind, means[kind]!);
      normal.rhs[kind] = normal.rhs[kind]! - means[kind]! * values[0]!;
    });
    // An unknown no equation touches (the heights, while every column is the camera's own) is held.
    for (let i = 0; i < 2 * nodes; i++) if (!(normal.diagonal(i) > 0)) normal.add(i, i, 1);
    const delta = normal.solve();
    if (!delta) throw new Error('The plan’s normal equations are not positive definite');
    const thetas = Float64Array.from(e.thetas);
    const laterals = e.laterals.map((values) => Float64Array.from(values));
    eliminations.forEach((elimination, t) => {
      if (!elimination) return;
      const { offset, marks, tt, tr, th } = elimination;
      const dot = (v: Float64Array) => v.reduce((sum, x, a) => sum + x * delta[offset + a]!, 0);
      const dt = tt > 0 ? (tr - dot(th)) / tt : 0;
      thetas[t] = thetas[t]! + dt;
      marks.forEach((mark, k) => {
        if (mark.ll > 0) laterals[t]![k] = laterals[t]![k]! + (mark.r - mark.lt * dt - dot(mark.h)) / mark.ll;
      });
    });
    return estimateOf(
      e.heading.map((v, j) => v + delta[2 * j]!),
      e.height.map((v, j) => v + delta[2 * j + 1]!),
      thetas,
      laterals,
    );
  };

  const DAMPING = 1e-3;
  let damping = DAMPING;
  /**
   * One Levenberg–Marquardt step at the points' current weights: damped until it lowers the weighted squares over the
   * points both the estimate and the step place (a row the step lifts above its frame's horizon has no depth).
   */
  const descend = (e: Estimate, residuals: Float64Array[], gradeWeight: number) => {
    const grades = gradeWeight * gradeSquares(e.height);
    for (; damping < 1e12; damping *= 10) {
      const trial = step(e, damping, gradeWeight);
      const next = residualsOf(trial);
      if (squares(next, residuals) + gradeWeight * gradeSquares(trial.height) < squares(residuals, next) + grades) {
        damping = Math.max(1e-9, damping / 10);
        return { estimate: trial, residuals: next };
      }
    }
    // No step lowers them: the weights are at their least squares.
    damping = DAMPING;
    return { estimate: e, residuals };
  };

  /**
   * After a step: each octave of depth has its own noise, its residuals' robust deviation, no less than a column's
   * rounding. A point weighs by its octave's inverse variance; points beyond three of their deviations, points with no
   * depth, and marks whose normalized root-mean-square residual is (another road's), are left out. Returns whether the
   * counted residuals moved by less than a tenth of their deviations (root mean square), and the octaves' noise.
   */
  const reweigh = (e: Estimate, residuals: readonly Float64Array[], before: readonly Float64Array[]) => {
    const samples = new Map<number, number[]>();
    frames.forEach((_, t) =>
      residuals[t]!.forEach((r, i) => {
        if (!Number.isFinite(r)) return;
        const k = octave(e.depths[t]![i]!);
        if (!samples.has(k)) samples.set(k, []);
        samples.get(k)!.push(r);
      }),
    );
    const noise = new Map(
      [...samples].map(([k, values]) => [k, Math.max(Math.sqrt(1 / 12), robustCentre(values).sigma)]),
    );
    let moved = 0,
      counted = 0;
    frames.forEach((frame, t) => {
      const r = residuals[t]!;
      const deviation = Float64Array.from(r, (_, i) => noise.get(octave(e.depths[t]![i]!)) ?? NaN);
      const sums = new Float64Array(frame.marks),
        counts = new Float64Array(frame.marks);
      r.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        sums[frame.mark[i]!] = sums[frame.mark[i]!]! + (v / deviation[i]!) ** 2;
        counts[frame.mark[i]!] = counts[frame.mark[i]!]! + 1;
      });
      r.forEach((v, i) => {
        if (frame.weight[i] && Number.isFinite(v) && Number.isFinite(before[t]![i]!)) {
          moved += ((v - before[t]![i]!) / deviation[i]!) ** 2;
          counted++;
        }
        const k = frame.mark[i]!;
        frame.weight[i] =
          Number.isFinite(v) && Math.abs(v) <= 3 * deviation[i]! && sums[k]! <= 9 * counts[k]!
            ? deviation[i]! ** -2
            : 0;
      });
    });
    return { settled: moved < 0.01 * counted, noise };
  };

  /**
   * Steps from `e` until the counted residuals move by less than a tenth of their deviations at no more than the first
   * damping (a heavily damped step moves little short of the least squares), or `limit` steps. With
   * `reweighing` each step is followed by new weights ([reweigh]) and the merging of marks the estimate shows to be one
   * line ([mergeMarks]), and the steps end only when none merge.
   */
  const fit = (e: Estimate, gradeWeight: number, reweighing: boolean, limit: number) => {
    let residuals: Float64Array[] = residualsOf(e);
    let rounds = 0,
      converged = false,
      noise = new Map<number, number>();
    for (; rounds < limit; rounds++) {
      const before = residuals;
      ({ estimate: e, residuals } = descend(e, residuals, gradeWeight));
      if (!reweighing) {
        let moved = 0,
          counted = 0;
        frames.forEach((frame, t) =>
          residuals[t]!.forEach((r, i) => {
            if (!frame.weight[i]) return;
            moved += frame.weight[i]! * (r - before[t]![i]!) ** 2;
            counted++;
          }),
        );
        if (moved < 0.01 * counted && damping <= DAMPING) {
          converged = true;
          break;
        }
        continue;
      }
      const reweighed = reweigh(e, residuals, before);
      noise = reweighed.noise;
      const merged = frames.reduce(
        (sum, frame, t) =>
          sum +
          mergeMarks(
            frame,
            e.depths[t]!,
            e.laterals,
            t,
            frameNormals(
              frame,
              frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell),
            ).precision,
          ),
        0,
      );
      if (merged) residuals = residualsOf(e);
      if (!merged && reweighed.settled && damping <= DAMPING) {
        converged = true;
        break;
      }
    }
    return { estimate: e, residuals, rounds, converged, noise };
  };

  /** The counted points, frames' and marks' unknowns, and the cells and nodes some counted point shows. */
  const counts = (e: Estimate) => {
    const curvature = new Uint8Array(nodes),
      height = new Uint8Array(nodes);
    let points = 0,
      frameUnknowns = 0;
    frames.forEach((frame, t) => {
      const marks = new Uint8Array(frame.marks);
      frame.y.forEach((_, i) => {
        if (!frame.weight[i]) return;
        const d = e.depths[t]![i]!;
        points++;
        marks[frame.mark[i]!] = 1;
        for (let q = node(frame.s).j; q < node(frame.s + d).j; q++) curvature[q] = 1;
        for (const x of [frame.s, frame.s + D, frame.s + d]) {
          const { j } = node(x);
          height[j] = height[j + 1] = 1;
        }
      });
      const seen = marks.reduce((sum, v) => sum + v, 0);
      if (seen) frameUnknowns += 1 + seen;
    });
    return { points, frameUnknowns, curvature, height };
  };

  return {
    frames,
    rule,
    start,
    cell,
    /** A straight, level road and level headings. */
    initial: () =>
      estimateOf(
        new Float64Array(nodes),
        new Float64Array(nodes),
        new Float64Array(frames.length),
        frames.map((frame) => new Float64Array(frame.marks)),
      ),
    residualsOf,
    squares,
    fit,
    /** An estimate of another problem over the same frames, its depths placed on this one's profile. */
    restart: (e: Estimate) => estimateOf(e.heading, e.height, e.thetas, e.laterals),
    counts,
    octave: (e: Estimate, t: number, i: number) => octave(e.depths[t]![i]!),
    /** The estimate as a [PlanEstimate]. */
    result(e: Estimate, residuals: readonly Float64Array[], gradeWeight: number, rounds: number, converged: boolean) {
      if (!rule) throw new Error('A plan with its heights held is no estimate under a pitch rule');
      const shown = counts(e);
      let sum = 0,
        points = 0;
      frames.forEach((frame, t) =>
        residuals[t]!.forEach((r, i) => {
          if (!frame.weight[i]) return;
          sum += r * r;
          points++;
        }),
      );
      const headingAt = (s: number) => {
        const { j, a } = node(s);
        return e.heading[j]! + a * (e.heading[j + 1]! - e.heading[j]!);
      };
      return {
        rule,
        start,
        cell,
        curvature: Array.from({ length: nodes - 1 }, (_, q) =>
          shown.curvature[q] ? (e.heading[q + 1]! - e.heading[q]!) / cell : NaN,
        ),
        height: Array.from(e.height, (y, j) => (shown.height[j] ? y : NaN)),
        gradeWeight,
        frames: frames.map((frame, t) => {
          const variance = frameNormals(
            frame,
            frameModel(frame, e.depths[t]!, e.heading, e.thetas[t]!, e.laterals[t]!, f, start, cell),
          ).variance;
          const known = Number.isFinite(variance);
          return {
            frame: frame.frame,
            s: frame.s,
            heading: known ? e.thetas[t]! : NaN,
            yaw: known ? e.thetas[t]! - headingAt(frame.s) : NaN,
            error: Math.sqrt(variance),
            pitch: pitchOf(e.height, frame.s),
          };
        }),
        residual: { rms: Math.sqrt(sum / points), points },
        rounds,
        converged,
      } satisfies PlanEstimate;
    },
  };
}

/**
 * A fit to one video's points under a pitch rule, the grades weighed only weakly, or with no rule the plan alone, its
 * heights held level: from a straight, level road and level headings by Gauss–Newton steps with Marquardt's damping,
 * each taken only when it lowers the weighted squares, each followed by new weights and merged marks ([planProblem]),
 * until none merge and the counted residuals move by less than a tenth of their deviations, or after `limit` steps,
 * unconverged. The fits are the points' evidence for the rule ([judgePitchRule]) and the start of the estimate under it
 * ([solvePlan]).
 */
export function fitPlan(frames: readonly FramePoints[], camera: FootageCamera, rule: PitchRule | null, limit = 100) {
  const problem = planProblem(frames, camera, rule);
  return { problem, ...problem.fit(problem.initial(), 0, true, limit) };
}

export type PlanFit = ReturnType<typeof fitPlan>;

/**
 * A video's estimate under `road` from its plan alone (`flat`) and its fit with every height free under `level`, and the
 * same frames under `level` at the grade weight `road` takes. The points' noise level is the free fit's, each octave's
 * deviation scaled so that its χ² per degree of freedom (counted points less the frames' `θ`, the lines' `l`, the shown
 * cells' `κ` and the shown nodes' `Y`) is 1. From the plan alone, the frames' squared grades are weighed as heavily as
 * keeps the χ² within the degrees of freedom without the nodes' `Y`: of the profiles that fit the points at their noise
 * level, the one with the least sum of squared grades over the frames. The weight is found by bisecting its logarithm
 * to a tenth of a decade, each weight's estimate stepped from the plan alone at fixed weights.
 */
function weighedGrades(
  fits: { readonly flat: PlanFit; readonly level: PlanFit },
  camera: FootageCamera,
  limit: number,
) {
  const { flat, level } = fits;
  const sum = (values: Uint8Array) => values.reduce((a, v) => a + v, 0);
  const free = level.problem.counts(level.estimate);
  const scale =
    level.problem.squares(level.residuals) /
    (free.points - free.frameUnknowns - sum(free.curvature) - sum(free.height));
  flat.problem.frames.forEach((frame, t) =>
    frame.weight.forEach((w, i) => {
      if (!w) return;
      const k = flat.problem.octave(flat.estimate, t, i);
      const sigma = level.noise.get(k) ?? flat.noise.get(k)!;
      frame.weight[i] = 1 / (scale * sigma * sigma);
    }),
  );
  const shown = flat.problem.counts(flat.estimate);
  const target = shown.points - shown.frameUnknowns - sum(shown.curvature);
  // A unit weight weighs a frame's grade as its counted points' mean weight weighs a column.
  const unit =
    flat.problem.frames.reduce((total, frame) => total + frame.weight.reduce((a, w) => a + w, 0), 0) / shown.points;
  const atWeight = (rule: PitchRule, gradeWeight: number) => {
    const problem = planProblem(flat.problem.frames, camera, rule);
    return { problem, gradeWeight, ...problem.fit(problem.restart(flat.estimate), gradeWeight, false, limit) };
  };
  const at = (exponent: number) => {
    const weighed = atWeight('road', unit * 10 ** exponent);
    return { ...weighed, within: weighed.problem.squares(weighed.residuals) <= target };
  };
  let low = -12,
    high = 12;
  let road = at(high);
  if (!road.within)
    while (high - low > 0.1) {
      const middle = (low + high) / 2,
        weighed = at(middle);
      if (weighed.within) {
        low = middle;
        road = weighed;
      } else high = middle;
    }
  return { road, heaviest: unit * 10 ** 12, level: () => atWeight('level', road.gradeWeight) };
}

/**
 * The pitch rule the rows ahead prefer by BIC over every video, and each video's estimate under it
 * ([Pitch and grade](../../docs/footage.md#inconsistencies-of-the-original)). Where `road` takes the heaviest grade
 * weight, the plan alone fits the points at their noise level and the screen shows no grade there: the rules do not
 * differ. Where it takes less, both rules are set against each other at that weight ([weighedGrades]), on the same
 * points and weights: their unknowns and their grades' weight are alike, so BIC compares their χ². Frames along one
 * stretch of road share their errors, so the difference's standard error over every such video is clustered by the
 * cell under the camera (Vuong's test of two models that do not nest), and a difference within three standard errors,
 * or no video showing a grade, is a tie, which takes `road`. Under `level` each video's estimate is its fit with every
 * height free; under `road` its weighed grades.
 */
export function solvePlans(
  videos: readonly { readonly flat: PlanFit; readonly level: PlanFit }[],
  camera: FootageCamera,
  limit = 100,
) {
  const weighed = videos.map((fits) => weighedGrades(fits, camera, limit));
  const roads = weighed.map(({ road }, v) =>
    road.problem.result(
      road.estimate,
      road.residuals,
      road.gradeWeight,
      videos[v]!.flat.rounds + road.rounds,
      road.converged,
    ),
  );
  let difference = 0,
    variance = 0,
    shown = 0;
  weighed.forEach(({ road, heaviest, level: atLevel }) => {
    if (road.gradeWeight === heaviest) return;
    shown++;
    const level = atLevel();
    const { start, cell, frames } = road.problem;
    const clusters = new Map<number, number>();
    frames.forEach((frame, t) => {
      const q = Math.floor((frame.s - start) / cell);
      let sum = 0;
      frame.weight.forEach((w, i) => {
        const r = road.residuals[t]![i]!,
          l = level.residuals[t]![i]!;
        if (w && Number.isFinite(r) && Number.isFinite(l)) sum += 0.5 * w * (r * r - l * l);
      });
      difference += sum;
      clusters.set(q, (clusters.get(q) ?? 0) + sum);
    });
    for (const sum of clusters.values()) variance += sum * sum;
  });
  const evidence = { shown, difference, standardError: Math.sqrt(variance) };
  if (!shown || difference <= 3 * evidence.standardError) return { rule: 'road' as PitchRule, evidence, plans: roads };
  return {
    rule: 'level' as PitchRule,
    evidence,
    plans: videos.map(({ level }) =>
      level.problem.result(level.estimate, level.residuals, 0, level.rounds, level.converged),
    ),
  };
}

/** A point's class: its octave of depth in metres (1–2 m, 2–4 m and so on). */
const octave = (d: number) => Math.floor(Math.log2(d));

/**
 * Merge a frame's marks that the estimate shows to be one line: marks whose counted points span depths apart and whose
 * laterals agree within three deviations (each lateral's precision, its points weighing by their inverse variance),
 * nearest first, as the dashes of a lane line share its lateral. Returns how many merged.
 */
function mergeMarks(
  frame: FramePoints,
  depths: Float64Array,
  laterals: Float64Array[],
  t: number,
  precision: Float64Array,
) {
  const count = frame.marks;
  if (count < 2) return 0;
  const near = new Float64Array(count).fill(Infinity),
    far = new Float64Array(count).fill(-Infinity);
  depths.forEach((d, i) => {
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
 * A frame's residuals at the current estimate (NaN where a point has no depth), and the model's derivatives in the
 * frame's own unknowns: its heading `θ` and each point's mark's lateral `l`.
 */
function frameModel(
  frame: FramePoints,
  depths: Float64Array,
  heading: Float64Array,
  theta: number,
  lateral: Float64Array,
  f: number,
  start: number,
  cell: number,
) {
  const n = depths.length;
  const residual = new Float64Array(n).fill(NaN),
    dTheta = new Float64Array(n),
    dLateral = new Float64Array(n);
  let far = 0;
  depths.forEach((d) => Number.isFinite(d) && (far = Math.max(far, d)));
  if (!far) return { residual, dTheta, dLateral };
  const metres = Math.ceil(far) + 1;
  const { phi } = view(frame, metres, heading, theta, start, cell);
  const sinPrefix = new Float64Array(metres + 1),
    cosPrefix = new Float64Array(metres + 1);
  for (let m = 0; m < metres; m++) {
    sinPrefix[m + 1] = sinPrefix[m]! + Math.sin(phi[m]!);
    cosPrefix[m + 1] = cosPrefix[m]! + Math.cos(phi[m]!);
  }
  for (let i = 0; i < n; i++) {
    const d = depths[i]!;
    if (!Number.isFinite(d)) continue;
    const scale = f / d,
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
    if (!w || !Number.isFinite(residual[i]!)) continue;
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
